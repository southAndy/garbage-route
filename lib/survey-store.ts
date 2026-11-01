import { z } from "zod";
import { SURVEY_REASONS } from "./survey-options";

/** Durable survey storage. A per-prompt feedback_id merges answer/reason events;
 * it is not a user identifier. Legacy clients may omit it during rollout. */
const short = z.string().trim().min(1).max(64);
const feedbackId = z.string().uuid().optional(); // Optional for already-open older clients.
const reasonList = z.string().trim().min(1).max(200).regex(/^[a-z_]+(,[a-z_]+)*$/);
const version = z.enum(["1", "2"]).optional();

export const surveyRecordSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("survey_answered"), feedback_id: feedbackId, survey_version: version, outcome: z.enum(["found", "not_found", "in_progress"]), visit: z.enum(["first", "return"]), route_id: short, city: short, district: short }),
  z.object({ event: z.literal("survey_reasons"), feedback_id: feedbackId, survey_version: version, reasons: reasonList, reason_revision: z.number().int().min(1).max(1_000_000).optional(), outcome: z.literal("not_found").optional(), visit: z.enum(["first", "return"]).optional(), route_id: short, city: short, district: short }),
]).superRefine((record, ctx) => {
  if (record.event === "survey_answered" && record.outcome === "in_progress" && record.survey_version !== "2") {
    ctx.addIssue({ code: "custom", message: "in_progress requires survey version 2" });
  }
  if (record.survey_version !== "2") return;
  if (!record.feedback_id) ctx.addIssue({ code: "custom", message: "version 2 requires feedback_id" });
  if (record.event === "survey_reasons" && (!record.reason_revision || record.outcome !== "not_found" || !record.visit ||
    (record.reasons !== "skipped" && !SURVEY_REASONS.some((reason) => reason.value === record.reasons)))) {
    ctx.addIssue({ code: "custom", message: "version 2 requires a single reason and a complete revision snapshot" });
  }
});
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
 * row by then, so anything other than "ok" is reported without automatic retries.
 * Version 2 merges by ID and revision; legacy clients without an ID still append on each request.
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
