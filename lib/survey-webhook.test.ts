import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../scripts/survey-sheet-webhook.gs", import.meta.url), "utf8");
const id = "00000000-0000-4000-8000-000000000001";
const base = { secret: "test", feedback_id: id, route_id: "r", city: "NTP", district: "永和區" };
function fixture() {
  function makeSheet(rows: unknown[][] = []) {
    const range = (r: number, c: number, height = 1, width = 1) => ({
      setValue(value: unknown) { rows[r - 1] ??= []; rows[r - 1][c - 1] = value; },
      setValues(values: unknown[][]) { values.forEach((row, i) => row.forEach((value, j) => range(r + i, c + j).setValue(value))); },
      getValues() { return Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => rows[r + i - 1]?.[c + j - 1] ?? "")); },
      createTextFinder(value: string) { return { matchEntireCell() { return this; }, findNext() {
        const index = rows.findIndex((row, i) => i >= r - 1 && i < r - 1 + height && row[c - 1] === value);
        return index < 0 ? null : { getRow: () => index + 1 };
      } }; },
    });
    return { rows, getRange: range, getLastRow: () => rows.length, getLastColumn: () => rows[0]?.length ?? 0, setFrozenRows: vi.fn() };
  }
  const quick = makeSheet();
  const sheets = new Map([["quick_answers", quick]]);
  const spreadsheet = { getSheetByName: (name: string) => sheets.get(name), insertSheet: (name: string) => {
    const sheet = makeSheet(); sheets.set(name, sheet); return sheet;
  } };
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => key === "SURVEY_SECRET" ? "test" : "sheet-id" }) },
    SpreadsheetApp: { openById: () => spreadsheet, flush: vi.fn() },
    LockService: { getScriptLock: () => ({ waitLock: vi.fn(), releaseLock: vi.fn() }) },
    ContentService: { MimeType: { TEXT: "text" }, createTextOutput: (text: string) => ({ setMimeType: () => text }) },
    doPost: undefined as unknown as (e: unknown) => string,
  };
  runInNewContext(source, context);
  return { rows: quick.rows, sheets,
    post: (data: object) => context.doPost({ postData: { contents: JSON.stringify(data) } }),
    record: (name = "quick_answers") => { const rows = sheets.get(name)!.rows; return Object.fromEntries(rows[0].map((key, i) => [key, rows[1][i]])); } };
}

describe("Apps Script webhook", () => {
  it("合併答案與原因，重送不增加列數，保留手動備註", () => {
    const f = fixture();
    const answer = { ...base, event: "survey_answered", outcome: "not_found", visit: "first" };
    expect(f.post(answer)).toBe("ok");
    expect(f.record().reason_status).toBe("not_received");
    f.rows[0].push("operator_note"); f.rows[1][f.rows[0].length - 1] = "keep me";
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

  it("新版尚未完成不算失敗，也不需要原因", () => {
    const f = fixture();
    expect(f.post({ ...base, survey_version: "2", event: "survey_answered", outcome: "in_progress", visit: "first" })).toBe("ok");
    expect(f.record()).toMatchObject({ outcome: "in_progress", survey_version: "2", reason_status: "not_applicable" });
    expect(f.post({ ...base, event: "survey_answered", outcome: "in_progress", visit: "first" })).toBe("bad request");
  });

  it("改選先到及重送仍只保留最後原因，原因快照本身含答案", () => {
    const f = fixture();
    const reason = { ...base, survey_version: "2", event: "survey_reasons", outcome: "not_found", visit: "return", reasons: "unreadable_schedule", reason_revision: 2 };
    expect(f.post(reason)).toBe("ok");
    expect(f.record()).toMatchObject({ outcome: "not_found", visit: "return", reasons: "unreadable_schedule", reason_revision: 2, reason_status: "answered" });
    f.post({ ...reason, reasons: "hard_to_use", reason_revision: 1 });
    f.post(reason);
    f.post({ ...base, survey_version: "2", event: "survey_answered", outcome: "not_found", visit: "return" });
    expect(f.rows).toHaveLength(2);
    expect(f.record()).toMatchObject({ reasons: "unreadable_schedule", reason_revision: 2, reason_status: "answered" });
    f.post({ ...reason, reasons: "skipped", reason_revision: 3 });
    expect(f.record()).toMatchObject({ reasons: "skipped", reason_status: "skipped", reason_revision: 3 });
  });

  it("新版拒絕缺少序號、非單選與不完整的原因", () => {
    const f = fixture();
    const reason = { ...base, survey_version: "2", event: "survey_reasons", outcome: "not_found", visit: "first", reasons: "hard_to_use", reason_revision: 1 };
    for (const invalid of [
      { reason_revision: undefined }, { reason_revision: 1.5 }, { reason_revision: 1_000_001 },
      { reasons: "no_route,hard_to_use" }, { reasons: "stop_location" }, { outcome: undefined }, { visit: undefined }, { feedback_id: undefined },
    ]) expect(f.post({ ...reason, ...invalid })).toBe("bad request");
    expect(f.rows).toHaveLength(0);
  });
});

const collectionBase = { secret: "test", page_type: "collection_points", survey_version: "1", feedback_id: id,
  city: "TPE", district: "松山區", point_id: "tpe-collection-25", view_mode: "map", trigger: "collection_map_dwell", visit: "first" };
describe("collection survey webhook", () => {
  it("同一試算表分開保存收受點與路線回答，不改動路線列", () => {
    const f = fixture();
    f.post({ ...base, event: "survey_answered", outcome: "found", visit: "first" });
    expect(f.post({ ...collectionBase, event: "survey_answered", outcome: "in_progress" })).toBe("ok");
    expect(f.rows).toHaveLength(2);
    expect(f.sheets.get("collection_answers")!.rows).toHaveLength(2);
    expect(f.record().route_id).toBe("r");
    expect(f.record("collection_answers")).toMatchObject({ page_type: "collection_points", point_id: "tpe-collection-25", view_mode: "map", outcome: "in_progress", reason_status: "not_applicable" });
  });
  it("原因先到可保留主答案，重送／亂序保留最新原因與人工備註", () => {
    const f = fixture();
    const reason = { ...collectionBase, event: "survey_reasons", outcome: "not_found", reasons: "unsuitable_hours", reason_revision: 2 };
    expect(f.post(reason)).toBe("ok");
    const rows = f.sheets.get("collection_answers")!.rows;
    rows[0].push("operator_note"); rows[1][rows[0].length - 1] = "keep me";
    f.post({ ...reason, reasons: "no_points", reason_revision: 1 });
    f.post(reason);
    f.post({ ...collectionBase, event: "survey_answered", outcome: "not_found" });
    expect(rows).toHaveLength(2);
    expect(f.record("collection_answers")).toMatchObject({ reasons: "unsuitable_hours", reason_revision: 2, reason_status: "answered", operator_note: "keep me" });
    expect(f.post({ ...reason, point_id: "other" })).toBe("conflict");
  });
  it("全市或空結果不需要站點 ID，拒絕未知原因與缺失回饋 ID", () => {
    const f = fixture();
    const answer = { ...collectionBase, district: "", point_id: undefined, trigger: "collection_empty_dwell", event: "survey_answered", outcome: "not_found" };
    expect(f.post(answer)).toBe("ok");
    expect(f.post({ ...answer, event: "survey_reasons", reasons: "skipped", reason_revision: 1 })).toBe("ok");
    expect(f.record("collection_answers").reason_status).toBe("skipped");
    expect(f.post({ ...answer, feedback_id: undefined })).toBe("bad request");
    expect(f.post({ ...answer, event: "survey_reasons", reasons: "no_route", reason_revision: 2 })).toBe("bad request");
  });
});
