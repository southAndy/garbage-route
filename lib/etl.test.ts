import { describe, expect, it } from "vitest";
import { normalizeNewTaipei, normalizeTaipei } from "./etl";

const source = { name:"test", url:"https://example.com", sourceUpdatedAt:null, syncedAt:"2026-08-02T00:00:00Z" };

describe("ETL", () => {
  it("臺北以路線與車次分組，並將 24xx 排在當日時間後", () => {
    const rows = [
      { 行政區:"士林區", 分隊:"天母", 路線:"A", 車次:"第1車", 抵達時間:"2411", 地點:"次日站", 經度:"121.5", 緯度:"25.1" },
      { 行政區:"士林區", 分隊:"天母", 路線:"A", 車次:"第1車", 抵達時間:"2350", 地點:"前站", 經度:"121.51", 緯度:"25.11" },
      { 行政區:"士林區", 分隊:"天母", 路線:"A", 車次:"第2車", 抵達時間:"1900", 地點:"另一車", 經度:"121.52", 緯度:"25.12" },
    ];
    const routes = normalizeTaipei(rows, source);
    expect(routes).toHaveLength(2);
    expect(routes.find((route) => route.tripLabel === "第1車")?.stops.map((stop) => stop.name)).toEqual(["前站","次日站"]);
  });
  it("新北依 rank 排序並保留無效座標", () => {
    const rows = [
      { city:"新店區", lineid:"7", linename:"測試線", rank:"2", name:"第二站", longitude:"", latitude:"", time:"18:20" },
      { city:"新店區", lineid:"7", linename:"測試線", rank:"1", name:"第一站", longitude:"121.5", latitude:"25", time:"18:10", garbagemonday:"Y" },
    ];
    const route = normalizeNewTaipei(rows, source)[0];
    expect(route.stops.map((stop) => stop.name)).toEqual(["第一站","第二站"]);
    expect(route.stops[1].coordinateStatus).toBe("missing");
    expect(route.geometry).toBeNull();
    expect(route.district).toBe("新店區");
    expect(route.stops[0].schedule?.garbage[1]).toBe(true);
  });
});
