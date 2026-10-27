import { NextResponse } from "next/server";
import { appendSurveyRecord, surveyRecordSchema, surveyStoreConfig } from "@/lib/survey-store";

const MAX_BODY_BYTES = 2_048;

/** Receives a one-tap survey answer from the route page and appends it to the Google Sheet. */
export async function POST(request: Request) {
  const config = surveyStoreConfig();
  if (!config) return new NextResponse(null, { status: 204 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload too large" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = surveyRecordSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid record" }, { status: 400 });

  try {
    await appendSurveyRecord(parsed.data, config);
  } catch (error) {
    console.error("[survey] sheet append failed", error);
    return NextResponse.json({ error: "store unavailable" }, { status: 502 });
  }
  return new NextResponse(null, { status: 202 });
}
