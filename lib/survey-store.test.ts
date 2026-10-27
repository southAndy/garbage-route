import { describe, expect, it, vi } from "vitest";
import { appendSurveyRecord, surveyRecordSchema, surveyStoreConfig } from "./survey-store";
import { POST } from "@/app/api/survey/route";

const answered = { event: "survey_answered", outcome: "found", visit: "first", route_id: "ntp-234001", city: "NTP", district: "永和區" } as const;
const config = { url: "https://script.google.com/macros/s/abc/exec", secret: "s3cret" };

describe("survey store", () => {
  it("只接受與分析事件相同的欄位", () => {
    expect(surveyRecordSchema.safeParse(answered).success).toBe(true);
    expect(surveyRecordSchema.safeParse({ ...answered, outcome: "maybe" }).success).toBe(false);
    expect(surveyRecordSchema.safeParse({ ...answered, event: "survey_shown" }).success).toBe(false);
    expect(surveyRecordSchema.safeParse({ event: "survey_reasons", reasons: "skipped", route_id: "r", city: "TPE", district: "大安區" }).success).toBe(true);
    expect(surveyRecordSchema.safeParse({ event: "survey_reasons", reasons: "free text!", route_id: "r", city: "TPE", district: "大安區" }).success).toBe(false);
    expect(surveyRecordSchema.safeParse({ ...answered, route_id: "x".repeat(65) }).success).toBe(false);
  });

  it("兩個環境變數都要有，且必須是 https", () => {
    expect(surveyStoreConfig({})).toBeNull();
    expect(surveyStoreConfig({ SURVEY_SHEET_WEBHOOK_URL: config.url })).toBeNull();
    expect(surveyStoreConfig({ SURVEY_SHEET_WEBHOOK_URL: "http://script.google.com/x", SURVEY_SHEET_SECRET: "s" })).toBeNull();
    expect(surveyStoreConfig({ SURVEY_SHEET_WEBHOOK_URL: ` ${config.url} `, SURVEY_SHEET_SECRET: config.secret })).toEqual(config);
  });

  it("把 secret 放進 body、跟著 302 走，回應不是 ok 就丟錯", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok\n", { status: 200 }));
    await appendSurveyRecord(answered, config, fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(config.url);
    expect(init.redirect).toBe("follow");
    expect(JSON.parse(String(init.body))).toEqual({ ...answered, secret: config.secret });

    const refused = vi.fn(async () => new Response("forbidden", { status: 200 }));
    await expect(appendSurveyRecord(answered, config, refused as unknown as typeof fetch)).rejects.toThrow(/forbidden/);
  });
});

describe("POST /api/survey", () => {
  const request = (body: unknown, length?: number) => new Request("http://localhost/api/survey", {
    method: "POST",
    headers: { "content-type": "application/json", ...(length !== undefined ? { "content-length": String(length) } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

  it("沒設定時回 204，不碰網路", async () => {
    vi.stubEnv("SURVEY_SHEET_WEBHOOK_URL", "");
    vi.stubEnv("SURVEY_SHEET_SECRET", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      expect((await POST(request(answered))).status).toBe(204);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });

  it("設定後驗證、轉送，壞資料回 400，webhook 失敗回 502", async () => {
    vi.stubEnv("SURVEY_SHEET_WEBHOOK_URL", config.url);
    vi.stubEnv("SURVEY_SHEET_SECRET", config.secret);
    const fetchSpy = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await POST(request(answered))).status).toBe(202);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect((await POST(request({ ...answered, outcome: "nope" }))).status).toBe(400);
      expect((await POST(request("{not json"))).status).toBe(400);
      expect((await POST(request(answered, 5000))).status).toBe(413);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockImplementationOnce(async () => new Response("forbidden", { status: 200 }));
      expect((await POST(request(answered))).status).toBe(502);
      expect(error).toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); error.mockRestore(); }
  });
});
