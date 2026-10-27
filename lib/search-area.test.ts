import { expect, it } from "vitest";
import { matchedStopArea } from "./search-area";
import { findSearchArea } from "./repository";
import type { GarbageRoute, RouteSummary } from "./types";

it("uses only matched trusted coordinates and deduplicates repeated trips", () => {
  const stops = [
    { id: "a", longitude: 121.5, latitude: 25, coordinateStatus: "valid" },
    { id: "b", longitude: 121.5, latitude: 25, coordinateStatus: "valid" },
    { id: "bad", longitude: 122, latitude: 25.3, coordinateStatus: "valid" },
    { id: "unmatched", longitude: 120, latitude: 24, coordinateStatus: "valid" },
    { id: "missing", longitude: null, latitude: null, coordinateStatus: "missing" },
  ];
  const routes = [{ stops }] as GarbageRoute[];
  const matches = [{ matches: { stops: ["a", "b", "bad", "missing"].map((stopId) => ({ stopId })) } }] as RouteSummary[];
  expect(matchedStopArea(routes, matches, "景新街", new Set(["bad"]))).toEqual({ bounds: [[121.5, 25], [121.5, 25]], count: 1, query: "景新街" });
  expect(matchedStopArea(routes, [], "無資料", new Set())).toBeNull();
});

it("narrows the reported address to Jingxin Street instead of claiming a house coordinate", () => {
  const area = findSearchArea("NTP", "中和區", "景新街293號");
  expect(area?.query).toBe("景新街");
  expect(area!.count).toBeGreaterThan(1);
  expect(area!.bounds[1][0] - area!.bounds[0][0]).toBeLessThan(0.05);
  expect(findSearchArea("NTP", "中和區", "不存在的店家名稱")).toBeNull();
});
