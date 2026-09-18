import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncData } from "./data-sync";
import type { GarbageRoute } from "./types";

const taipeiUrl = "https://example.com/taipei.csv";
const newTaipeiUrl = "https://example.com/new-taipei.csv";
const taipeiCsv = "行政區,分隊,路線,車次,抵達時間,地點,經度,緯度\n士林區,天母,A,第1車,1900,第一站,121.51,25.11\n";
const newTaipeiCsv = "city,lineid,linename,rank,name,longitude,latitude,time,garbagemonday\n新店區,7,測試線,1,第一站,121.5,25,18:10,Y\n";
const snapshotFiles = ["routes.json", "manifest.json", "suspicious-coordinates.json"];
let directory: string;
let tpeBody: string;
let ntpStatus: number;

async function readSnapshot() {
  return Promise.all(snapshotFiles.map((file) => readFile(join(directory, file), "utf8")));
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "garbage-sync-test-"));
  await writeFile(join(directory, "routes.json"), "[]\n");
  tpeBody = taipeiCsv;
  ntpStatus = 200;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-18T21:23:00Z"));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(
    url === taipeiUrl ? tpeBody : newTaipeiCsv,
    { status: url === taipeiUrl ? 200 : ntpStatus },
  )));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

describe("官方資料同步", () => {
  it("成功時產生兩市快照、品質報告與檢查時間", async () => {
    await expect(syncData({ directory, taipeiUrl, newTaipeiUrl })).resolves.toMatchObject({ changed: true });
    const [routesJson, manifestJson, reportJson] = await readSnapshot();
    const routes = JSON.parse(routesJson) as GarbageRoute[];
    const manifest = JSON.parse(manifestJson);
    expect(routes.map((route) => route.cityCode)).toEqual(["TPE", "NTP"]);
    expect(manifest.lastCheckedAt).toBe("2026-09-18T21:23:00.000Z");
    expect(manifest.generatedAt).toBe(manifest.lastCheckedAt);
    expect(JSON.parse(reportJson).summary.routesScanned).toBe(2);
  });

  it("來源未變時只更新成功檢查時間，保留資料時間與完整快照", async () => {
    await syncData({ directory, taipeiUrl, newTaipeiUrl });
    const before = await readSnapshot();
    vi.setSystemTime(new Date("2026-09-19T21:23:00Z"));
    await expect(syncData({ directory, taipeiUrl, newTaipeiUrl })).resolves.toMatchObject({ changed: false });
    const after = await readSnapshot();
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(JSON.parse(after[1]).generatedAt).toBe(JSON.parse(before[1]).generatedAt);
    expect(JSON.parse(after[1]).lastCheckedAt).toBe("2026-09-19T21:23:00.000Z");
  });

  it("任一來源下載失敗時保留所有快照與上次成功檢查時間", async () => {
    await syncData({ directory, taipeiUrl, newTaipeiUrl });
    const before = await readSnapshot();
    ntpStatus = 503;
    await expect(syncData({ directory, taipeiUrl, newTaipeiUrl })).rejects.toThrow("HTTP 503");
    expect(await readSnapshot()).toEqual(before);
  });

  it("來源格式改變導致品質不合格時不發布空資料", async () => {
    await syncData({ directory, taipeiUrl, newTaipeiUrl });
    const before = await readSnapshot();
    tpeBody = "unexpected_column\ninvalid data\n";
    await expect(syncData({ directory, taipeiUrl, newTaipeiUrl })).rejects.toThrow("品質檢查未通過");
    expect(await readSnapshot()).toEqual(before);
  });
});
