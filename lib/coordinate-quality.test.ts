import { describe, expect, it } from "vitest";
import { findSuspiciousCoordinates } from "./coordinate-quality";
import type { GarbageRoute, GarbageStop } from "./types";

function stop(sequence: number, longitude: number, latitude: number): GarbageStop {
  return {
    id: `stop-${sequence}`,
    routeId: "route-1",
    sequence,
    name: `第 ${sequence} 站`,
    address: null,
    village: null,
    longitude,
    latitude,
    arrivalTime: null,
    departureTime: null,
    serviceDayOffset: 0,
    memo: null,
    schedule: null,
    coordinateStatus: "valid",
  };
}

function route(stops: GarbageStop[]): GarbageRoute {
  return {
    id: "route-1",
    cityCode: "TPE",
    district: "文山區",
    districtSlug: "wenshan",
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
    source: { name: "test", url: "https://example.com", sourceUpdatedAt: null, syncedAt: "2026-08-02T00:00:00Z" },
  };
}

describe("findSuspiciousCoordinates", () => {
  it("找出偏離前後相鄰站的單一座標", () => {
    const findings = findSuspiciousCoordinates([route([
      stop(1, 121.55, 25),
      stop(2, 121.05, 25),
      stop(3, 121.551, 25.001),
    ])]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ type: "isolated_stop", stop: { id: "stop-2" } });
  });

  it("兩站距離過遠時列為待人工確認區段", () => {
    const findings = findSuspiciousCoordinates([route([
      stop(1, 121.55, 25),
      stop(2, 121.35, 25),
    ])]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ type: "long_segment", fromStop: { id: "stop-1" }, toStop: { id: "stop-2" } });
  });

  it("不標記合理的鄰近停靠點", () => {
    const findings = findSuspiciousCoordinates([route([
      stop(1, 121.55, 25),
      stop(2, 121.551, 25.001),
      stop(3, 121.552, 25.002),
    ])]);
    expect(findings).toEqual([]);
  });

  it("保留人工加入的待確認停靠點", () => {
    const value = route([
      stop(1, 121.544769, 24.996981),
      stop(2, 121.554717, 24.998029),
      stop(3, 121.545087, 24.998644),
    ]);
    const findings = findSuspiciousCoordinates([value], [{
      id: "manual-stop-2",
      type: "isolated_stop",
      routeId: "route-1",
      stopId: "stop-2",
      reason: "人工確認位置待查",
      addedAt: "2026-08-02",
    }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: "manual-stop-2", detection: "manual", stop: { id: "stop-2" } });
  });
});
