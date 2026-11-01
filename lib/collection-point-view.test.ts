import { expect, it } from "vitest";
import { collectionPointsPath } from "./paths";
import { readCollectionPointScope, collectionPointNavigationUrl } from "./collection-point-view";

const districts = { TPE: ["松山區", "信義區"], NTP: ["永和區"] };
it("城市與行政區可編碼進網址並還原，無上下文時保留一般入口", () => {
  expect(collectionPointsPath()).toBe("/collection-points");
  const url = new URL(collectionPointsPath("TPE", "松山區"), "https://example.test");
  expect(readCollectionPointScope(url.searchParams, districts)).toEqual({ city: "TPE", district: "松山區" });
});
it.each(["city=garbage&district=不存在", "city=TPE&district=永和區", "city=NTP&district=松山區"])("不使用無效或屬於另一城市的行政區 %s", (query) => {
  expect(readCollectionPointScope(new URLSearchParams(query), districts).district).toBe("");
});
it("正常化小寫城市代碼，保留沒有收受點的有效行政區", () => {
  expect(readCollectionPointScope(new URLSearchParams("city=tpe&district=信義區"), districts)).toEqual({ city: "TPE", district: "信義區" });
});
it("缺座標時使用地址導航，沒有使用者位置", () => {
  const url = new URL(collectionPointNavigationUrl({ id: "test", district: "松山區", name: "測試點", address: "測試地址", notes: "", phone: "", latitude: null, longitude: null }));
  expect(url.searchParams.get("destination")).toBe("臺北市松山區 測試地址");
  expect(url.searchParams.has("origin")).toBe(false);
});
