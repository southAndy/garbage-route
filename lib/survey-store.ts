import { z } from "zod";

/**
 * Durable copy of the one-tap survey answers. Vercel Analytics keeps the same fields as event
 * properties, but only for its retention window; this forwards each answer to a Google Sheet
 * through an Apps Script web app (see scripts/survey-sheet-webhook.gs) so the rows accumulate
 * next to the Tally responses. Fields mirror the analytics events exactly: no location, no free
 * text, no identifiers.
 */
const short = z.string().trim().min(1).max(64);
const reasonList = z.string().trim().min(1).max(200).regex(/^[a-z_]+(,[a-z_]+)*$/);

export const surveyRecordSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("survey_answered"), outcome: z.enum(["found", "not_found"]), visit: z.enum(["first", "return"]), route_id: short, city: short, district: short }),
  z.object({ event: z.literal("survey_reasons"), reasons: reasonList, route_id: short, city: short, district: short }),
]);
export type SurveyRecord = z.infer<typeof surveyRecordSchema>;

export function surveyStoreConfig(env: Record<string, string | undefined> = process.env) {
  const url = env.SURVEY_SHEET_WEBHOOK_URL?.trim();
  const secret = env.SURVEY_SHEET_SECRET?.trim();
  if (!url || !secret) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url, secret };
}

/**
 * Apps Script answers a POST with a 302 to script.googleusercontent.com; `redirect: "follow"`
 * turns that into the script's own "ok"/"forbidden" text. The script has already appended the
 * row by then, so anything other than "ok" is reported but never retried (a retry would double
 * the row).
 */
export async function appendSurveyRecord(record: SurveyRecord, config: { url: string; secret: string }, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(config.url, {
    method: "POST",
    redirect: "follow",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...record, secret: config.secret }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = (await response.text()).trim();
  if (!response.ok || text !== "ok") throw new Error(`survey sheet webhook replied ${response.status}: ${text.slice(0, 80)}`);
}
