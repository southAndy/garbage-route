import { describe, expect, it } from "vitest";
import { MATCHED_STOP_LIMIT, searchRoute, splitByQuery } from "./route-search";
import type { GarbageRoute, GarbageStop } from "./types";

const days = [false, true, true, false, true, true, true];
function stop(sequence: number, name: string, arrivalTime: string, village = "前溪里"): GarbageStop {
  return { id: `s${sequence}`, routeId: "r", sequence, name, address: name, village, longitude: 121.5, latitude: 25, arrivalTime, departureTime: null, serviceDayOffset: 0, memo: null, schedule: { garbage: days, recycling: days, foodScraps: days }, coordinateStatus: "valid" };
}
const route: GarbageRoute = {
  id: "ntp-234001", cityCode: "NTP", district: "永和區", districtSlug: "yonghe", sourceRouteId: null, routeName: "三區午7", tripLabel: null,
  teamName: null, vehicleCode: null, licensePlate: null, firstArrivalTime: "12:56", lastArrivalTime: "14:32", stopCount: 4, geometry: null,
  stops: [stop(1, "永和路一段157號", "12:56"), stop(2, "永平路12巷口", "12:57"), stop(3, "和平街17巷口", "13:10", "和平里"), stop(4, "永平路164號", "13:08")],
  source: { name: "新北市垃圾車路線", url: "https://example.test", sourceUpdatedAt: null, syncedAt: "2026-10-09T01:17:08.497Z" },
};

describe("searchRoute", () => {
  it("空查詢回傳摘要，不帶 matches", () => {
    const summary = searchRoute(route, "  ");
    expect(summary?.id).toBe("ntp-234001");
    expect(summary?.matches).toBeUndefined();
  });

  it("依站名、地址或里別比對，依路線順序回傳匹配站點與時間", () => {
    const summary = searchRoute(route, "永平路");
    expect(summary?.matches?.count).toBe(2);
    expect(summary?.matches?.stops.map((item) => [item.stopId, item.scheduledTime])).toEqual([["s2", "12:57"], ["s4", "13:08"]]);
    expect(summary?.matches?.stops[0].serviceDays).toEqual(days);
    expect(searchRoute(route, "和平里")?.matches?.stops.map((item) => item.name)).toEqual(["和平街17巷口"]);
  });

  it("路線名稱符合但沒有站點符合時，matches 為空而不是 null", () => {
    const summary = searchRoute(route, "午7");
    expect(summary).not.toBeNull();
    expect(summary?.matches).toEqual({ count: 0, stops: [] });
  });

  it("都不符合時回傳 null，比對不分大小寫與前後空白", () => {
    expect(searchRoute(route, "中正路")).toBeNull();
    expect(searchRoute({ ...route, routeName: "Tianmu-1" }, " tianmu ")?.id).toBe("ntp-234001");
  });

  it("匹配站點超過上限時只送前面的，count 仍是全部", () => {
    const many: GarbageRoute = { ...route, stops: Array.from({ length: MATCHED_STOP_LIMIT + 5 }, (_, index) => stop(index + 1, `永平路${index + 1}號`, "13:00")) };
    const summary = searchRoute(many, "永平路");
    expect(summary?.matches?.count).toBe(MATCHED_STOP_LIMIT + 5);
    expect(summary?.matches?.stops).toHaveLength(MATCHED_STOP_LIMIT);
  });
});

describe("splitByQuery", () => {
  it("把文字切成一般、匹配交錯的片段，奇數位置是匹配", () => {
    expect(splitByQuery("中山路一段永平路口", "永平路")).toEqual(["中山路一段", "永平路", "口"]);
    expect(splitByQuery("永平路12巷口", "永平路")).toEqual(["", "永平路", "12巷口"]);
    expect(splitByQuery("和平街", "永平路")).toEqual(["和平街"]);
    expect(splitByQuery("和平街", "")).toEqual(["和平街"]);
  });
});
