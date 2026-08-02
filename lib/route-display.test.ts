import { describe, expect, it } from "vitest";
import { createDisplayGeometries, suspiciousStopIds, warningForStop } from "./route-display";
import type { GarbageRoute, GarbageStop } from "./types";

function stop(sequence: number): GarbageStop {
  return {
    id: `stop-${sequence}`,
    routeId: "route-1",
    sequence,
    name: `第 ${sequence} 站`,
    address: null,
    village: null,
    longitude: 121.5 + sequence / 100,
    latitude: 25 + sequence / 100,
    arrivalTime: null,
    departureTime: null,
    serviceDayOffset: 0,
    memo: null,
    schedule: null,
    coordinateStatus: "valid",
  };
}

function route(type: "isolated_stop" | "long_segment", affectedStopIds: string[]): GarbageRoute {
  const stops = [stop(1), stop(2), stop(3), stop(4)];
  return {
    id: "route-1",
    cityCode: "TPE",
    district: "測試區",
    districtSlug: "test",
    sourceRouteId: null,
    routeName: "測試線",
    tripLabel: null,
    teamName: null,
    vehicleCode: null,
    licensePlate: null,
    firstArrivalTime: null,
    lastArrivalTime: null,
    stopCount: stops.length,
    geometry: null,
    stops,
    coordinateWarnings: [{ id: "warning-1", type, severity: "high", message: "待確認", affectedStopIds }],
    source: { name: "test", url: "https://example.com", sourceUpdatedAt: null, syncedAt: "2026-08-02T00:00:00Z" },
  };
}

describe("route display", () => {
  it("孤立可疑站前後改列為可疑線段", () => {
    const value = route("isolated_stop", ["stop-2"]);
    expect(createDisplayGeometries(value).normal?.coordinates).toEqual([
      [[121.53, 25.03], [121.54, 25.04]],
    ]);
    expect(createDisplayGeometries(value).suspicious?.coordinates).toEqual([
      [[121.51, 25.01], [121.52, 25.02]],
      [[121.52, 25.02], [121.53, 25.03]],
    ]);
    expect([...suspiciousStopIds(value)]).toEqual(["stop-2"]);
    expect(warningForStop(value, value.stops[1])?.id).toBe("warning-1");
  });

  it("長區段只切斷指定的兩站之間", () => {
    const geometries = createDisplayGeometries(route("long_segment", ["stop-2", "stop-3"]));
    expect(geometries.normal?.coordinates).toEqual([
      [[121.51, 25.01], [121.52, 25.02]],
      [[121.53, 25.03], [121.54, 25.04]],
    ]);
    expect(geometries.suspicious?.coordinates).toEqual([
      [[121.52, 25.02], [121.53, 25.03]],
    ]);
  });
});
