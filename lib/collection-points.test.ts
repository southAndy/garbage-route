import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { parseCollectionPoints } from "./collection-points";
import { loadCollectionPoints } from "./collection-point-loader";

const header = "行政區,分隊,電話,地址,備註,緯度,經度\n";
const csv = header + '中正區,測試分隊,02-12345678,測試地址,"週一 07:00–08:00\n只收一般垃圾",25.03,121.52';
afterEach(() => vi.unstubAllGlobals());

it("保留官方多行時段，不推測收受種類", () => {
  const [point] = parseCollectionPoints("\uFEFF" + csv);
  expect(point.notes).toBe("週一 07:00–08:00\n只收一般垃圾");
  expect(point.latitude).toBe(25.03);
});
it.each([",", "0,0", "121.52,25.03", "abc,121.52"])("不使用缺失或異常座標 %s", (coordinates) => {
  const [point] = parseCollectionPoints(header + `中正區,測試分隊,,測試地址,,${coordinates}`);
  expect(point.latitude).toBeNull();
  expect(point.longitude).toBeNull();
  expect(point.notes).toContain("未列");
});
it("拒絕格式變動、空資料與缺少地址的來源", () => {
  expect(() => parseCollectionPoints("<html>error</html>")).toThrow();
  expect(() => parseCollectionPoints(header)).toThrow();
  expect(() => parseCollectionPoints(header + "中正區,分隊,,,備註,25,121.5")).toThrow();
});
it("來源失效時顯示不可用而非假裝沒有收受點", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  expect(await loadCollectionPoints()).toEqual({ points: [], failed: true });
});
it("成功讀取來源，非成功狀態不得當成正常資料", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(csv)));
  expect((await loadCollectionPoints()).points).toHaveLength(1);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(csv, { status: 503 })));
  expect((await loadCollectionPoints()).failed).toBe(true);
});

// Official CSV downloaded 2026-11-01; source updated 2026-02-23.
// https://data.taipei/dataset/detail?id=1acf38f3-1509-4cb1-898a-9b1d4f31a3af
it.each(["text/csv", "text/csv; charset=big5", "text/csv; charset=utf-8"])("可讀取官方 Big5 CSV，不依賴 Content-Type 的編碼宣告 %s", async (contentType) => {
  const bytes = new Uint8Array(readFileSync(new URL("./fixtures/taipei-collection-points.big5.csv", import.meta.url)));
  // Response.text() always uses UTF-8, even if the response declares Big5.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, {
    headers: { "content-type": contentType },
  })));
  const result = await loadCollectionPoints();
  expect(result.failed).toBe(false);
  expect(result.points).toHaveLength(30);
  expect(result.points[0]).toMatchObject({
    district: "士林區", name: "蘭雅", address: "臺北市士林區文昌路211之3號",
    notes: "周三、周日開放時間為06：00~16：00，其餘開放時間為06：00~22：00",
    latitude: 25.09997, longitude: 121.52006,
  });
  expect(result.points.find((point) => point.name === "南京")?.notes).toContain("資源回收物(不含廚餘)");
});
