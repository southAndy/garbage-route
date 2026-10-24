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
