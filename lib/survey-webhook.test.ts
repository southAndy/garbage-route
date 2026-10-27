import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../scripts/survey-sheet-webhook.gs", import.meta.url), "utf8");
const id = "00000000-0000-4000-8000-000000000001";
const base = { secret: "test", feedback_id: id, route_id: "r", city: "NTP", district: "永和區" };
function fixture() {
  const rows: unknown[][] = [];
  const range = (r: number, c: number, height = 1, width = 1) => ({
    setValue(value: unknown) { rows[r - 1] ??= []; rows[r - 1][c - 1] = value; },
    setValues(values: unknown[][]) { values.forEach((row, i) => row.forEach((value, j) => range(r + i, c + j).setValue(value))); },
    getValues() { return Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => rows[r + i - 1]?.[c + j - 1] ?? "")); },
    createTextFinder(value: string) { return { matchEntireCell() { return this; }, findNext() {
      const index = rows.findIndex((row, i) => i >= r - 1 && i < r - 1 + height && row[c - 1] === value);
      return index < 0 ? null : { getRow: () => index + 1 };
    } }; },
  });
  const sheet = { getRange: range, getLastRow: () => rows.length, getLastColumn: () => rows[0]?.length ?? 0, setFrozenRows: vi.fn() };
  const spreadsheet = { getSheetByName: () => sheet, insertSheet: () => sheet };
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => key === "SURVEY_SECRET" ? "test" : "sheet-id" }) },
    SpreadsheetApp: { openById: () => spreadsheet, flush: vi.fn() },
    LockService: { getScriptLock: () => ({ waitLock: vi.fn(), releaseLock: vi.fn() }) },
    ContentService: { MimeType: { TEXT: "text" }, createTextOutput: (text: string) => ({ setMimeType: () => text }) },
    doPost: undefined as unknown as (e: unknown) => string,
  };
  runInNewContext(source, context);
  return { rows, post: (data: object) => context.doPost({ postData: { contents: JSON.stringify(data) } }), record: () => Object.fromEntries(rows[0].map((key, i) => [key, rows[1][i]])) };
}

describe("Apps Script webhook", () => {
  it("合併答案與原因，重送不增加列數，保留手動備註", () => {
    const f = fixture();
    const answer = { ...base, event: "survey_answered", outcome: "not_found", visit: "first" };
    expect(f.post(answer)).toBe("ok");
    expect(f.record().reason_status).toBe("not_received");
    f.rows[0].push("operator_note"); f.rows[1].push("keep me");
    expect(f.post({ ...base, event: "survey_reasons", reasons: "no_route" })).toBe("ok");
    expect(f.post(answer)).toBe("ok");
    expect(f.rows).toHaveLength(2);
    expect(f.record()).toMatchObject({ outcome: "not_found", reasons: "no_route", reason_status: "answered", operator_note: "keep me" });
  });
  it("原因先到仍能合併，略過與未收到分開", () => {
    const f = fixture();
    f.post({ ...base, event: "survey_reasons", reasons: "skipped" });
    f.post({ ...base, event: "survey_answered", outcome: "not_found", visit: "first" });
    expect(f.rows).toHaveLength(2);
    expect(f.record()).toMatchObject({ outcome: "not_found", reason_status: "skipped" });
  });
  it("驗證密鑰及內容，阻擋跨路線覆寫與試算表公式", () => {
    const f = fixture();
    const answer = { ...base, event: "survey_answered", outcome: "found", visit: "first" };
    expect(f.post({ ...answer, secret: "bad" })).toBe("forbidden");
    expect(f.post({ ...answer, outcome: "unknown" })).toBe("bad request");
    expect(f.rows).toHaveLength(0);
    f.post(answer);
    expect(f.post({ ...answer, route_id: "another" })).toBe("conflict");
    f.post({ ...answer, feedback_id: undefined, district: '=IMPORTDATA("x")' });
    expect(f.rows[2][6]).toBe('\'=IMPORTDATA("x")');
  });
  it("保留舊欄位與無 ID 的舊版回饋", () => {
    const f = fixture();
    f.rows.push(["received_at", "event", "outcome", "reasons", "route_id", "city", "district", "visit"]);
    f.rows.push(["old date", "survey_answered", "found", "", "old route", "NTP", "永和區", "first"]);
    f.post({ ...base, feedback_id: undefined, event: "survey_answered", outcome: "found", visit: "first" });
    expect(f.rows).toHaveLength(3);
    expect(f.rows[1][4]).toBe("old route");
    expect(f.rows[0]).toContain("feedback_id");
  });
});
