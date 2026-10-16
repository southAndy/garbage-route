import { describe, expect, it } from "vitest";
import { createNearbyIndex, haversineMeters, parseNearbyQuery, roundCoordinate, searchNearby } from "./nearby-search";
import type { GarbageRoute, GarbageStop } from "./types";

// 0.001° of latitude is ~111 m; 0.001° of longitude at 25°N is ~101 m.
const ORIGIN = { lat: 25.0, lng: 121.5 };

function stop(routeId: string, sequence: number, dLat: number, dLng: number, extra: Partial<GarbageStop> = {}): GarbageStop {
  return {
    id: `${routeId}-stop-${sequence}`, routeId, sequence, name: `${routeId} 第 ${sequence} 站`, address: null, village: null,
    longitude: ORIGIN.lng + dLng, latitude: ORIGIN.lat + dLat, arrivalTime: `19:${String(sequence).padStart(2, "0")}`,
    departureTime: null, serviceDayOffset: 0, memo: null, schedule: null, coordinateStatus: "valid", ...extra,
  };
}

function route(id: string, stops: GarbageStop[], extra: Partial<GarbageRoute> = {}): GarbageRoute {
  return {
    id, cityCode: "NTP", district: "永和區", districtSlug: "yonghe", sourceRouteId: null, routeName: id, tripLabel: null,
    teamName: null, vehicleCode: null, licensePlate: null,
    firstArrivalTime: stops[0]?.arrivalTime ?? null, lastArrivalTime: stops.at(-1)?.arrivalTime ?? null,
    stopCount: stops.length, geometry: null, stops,
    source: { name: "測試", url: "https://example.com", sourceUpdatedAt: null, syncedAt: "2026-10-01T00:00:00Z" },
    ...extra,
  };
}

const routes: GarbageRoute[] = [
  // Four stops within 500 m, one far away; stop 4 is nearest but comes late in the route.
  route("近線", [stop("近線", 1, 0.003, 0), stop("近線", 2, 0.002, 0), stop("近線", 3, 0.05, 0), stop("近線", 4, 0.001, 0), stop("近線", 5, 0.004, 0)]),
  // One stop ~200 m away.
  route("單站線", [stop("單站線", 1, 0, 0.002)]),
  // Only reachable once the radius grows to 1 km (~780 m), and belongs to another district.
  route("中和線", [stop("中和線", 1, 0.007, 0)], { district: "中和區", districtSlug: "zhonghe" }),
  // Bad coordinates must never be returned or counted.
  route("壞座標線", [stop("壞座標線", 1, 0.0005, 0, { coordinateStatus: "invalid" }), stop("壞座標線", 2, 0.0005, 0.0005)]),
  route("遠線", [stop("遠線", 1, 0.5, 0.5)], { cityCode: "TPE", district: "士林區", districtSlug: "shilin" }),
];

describe("haversineMeters / roundCoordinate", () => {
  it("計算的距離與已知值相近", () => {
    expect(haversineMeters(ORIGIN, { lat: 25.001, lng: 121.5 })).toBeCloseTo(111.2, 0);
    expect(haversineMeters(ORIGIN, ORIGIN)).toBe(0);
  });

  it("座標四捨五入到小數第三位", () => {
    expect(roundCoordinate(25.03374567)).toBe(25.034);
    expect(roundCoordinate(121.5)).toBe(121.5);
  });
});

describe("parseNearbyQuery", () => {
  it("接受台灣範圍內的座標並套用預設半徑", () => {
    const parsed = parseNearbyQuery(new URLSearchParams({ lat: "25.0123456", lng: "121.5" }));
    expect(parsed).toEqual({ ok: true, point: { lat: 25.012, lng: 121.5 }, radius: 500 });
  });

  it("拒絕缺少、非數字或台灣範圍外的座標", () => {
    const cases: Record<string, string>[] = [{}, { lat: "abc", lng: "121.5" }, { lat: "35.6", lng: "139.7" }, { lat: "25" }];
    for (const params of cases) {
      const parsed = parseNearbyQuery(new URLSearchParams(params));
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.code).toBe("INVALID_LOCATION");
    }
  });

  it("半徑只接受 500 或 1000", () => {
    expect(parseNearbyQuery(new URLSearchParams({ lat: "25", lng: "121.5", radius: "1000" }))).toMatchObject({ ok: true, radius: 1000 });
    const bad = parseNearbyQuery(new URLSearchParams({ lat: "25", lng: "121.5", radius: "750" }));
    expect(bad).toMatchObject({ ok: false, code: "INVALID_RADIUS" });
  });
});

describe("searchNearby", () => {
  const index = createNearbyIndex(routes, new Set(["壞座標線-stop-2"]));

  it("只回傳半徑內的站點，依路線分組並以最近站點排序", () => {
    const result = searchNearby(index, ORIGIN, 500);
    expect(result.radius).toBe(500);
    expect(result.expanded).toBe(false);
    expect(result.routes.map((item) => item.id)).toEqual(["近線", "單站線"]);
    const near = result.routes[0];
    expect(near.nearby.count).toBe(4);
    expect(near.nearby.nearestDistanceMeters).toBe(111);
    expect(near.nearby.stops.map((item) => item.stopId)).toEqual(["近線-stop-4", "近線-stop-2", "近線-stop-1"]);
    expect(near.nearby.stops[0]).toEqual({ stopId: "近線-stop-4", name: "近線 第 4 站", scheduledTime: "19:04", serviceDayOffset: 0, distanceMeters: 111, serviceDays: null });
  });

  it("相關站點的時間範圍依路線順序取首末站，而非全線", () => {
    const near = searchNearby(index, ORIGIN, 500).routes[0];
    expect(near.nearby.firstTime).toBe("19:01");
    expect(near.nearby.lastTime).toBe("19:05");
    expect(near.firstArrivalTime).toBe("19:01");
    expect(near.lastArrivalTime).toBe("19:05");
    expect(near.nearby.firstTimeOffset).toBe(0);
    expect(near.nearby.lastTimeOffset).toBe(0);
  });

  it("清運日取範圍內站點的聯集，沒有排程時為 null", () => {
    const monWedFri = [false, true, false, true, false, true, false];
    const tue = [false, false, true, false, false, false, false];
    const withSchedule = createNearbyIndex([
      route("排程線", [stop("排程線", 1, 0.001, 0, { schedule: { garbage: monWedFri, recycling: monWedFri, foodScraps: monWedFri } }), stop("排程線", 2, 0.002, 0, { schedule: { garbage: tue, recycling: tue, foodScraps: tue } }), stop("排程線", 3, 0.003, 0)]),
    ]);
    const result = searchNearby(withSchedule, ORIGIN, 500).routes[0];
    expect(result.nearby.serviceDays).toEqual([false, true, true, true, false, true, false]);
    expect(result.nearby.stops.find((item) => item.stopId === "排程線-stop-3")?.serviceDays).toBeNull();
    expect(searchNearby(index, ORIGIN, 500).routes[0].nearby.serviceDays).toBeNull();
  });

  it("座標無效或被標記為可疑的站點不會出現", () => {
    const ids = searchNearby(index, ORIGIN, 1000).routes.map((item) => item.id);
    expect(ids).not.toContain("壞座標線");
  });

  it("500 公尺內沒有結果時自動擴大到 1 公里並標記 expanded", () => {
    // ~707 m from 中和線 and ~780 m from the closest 近線 stop, so 500 m is empty.
    const farPoint = { lat: ORIGIN.lat + 0.007, lng: ORIGIN.lng + 0.007 };
    const result = searchNearby(index, farPoint, 500);
    expect(result.expanded).toBe(true);
    expect(result.radius).toBe(1000);
    expect(result.routes.map((item) => item.id)).toContain("中和線");
  });

  it("直接要求 1 公里時不算 expanded", () => {
    const result = searchNearby(index, ORIGIN, 1000);
    expect(result.expanded).toBe(false);
    expect(result.routes.map((item) => item.id)).toEqual(["近線", "單站線", "中和線"]);
  });

  it("以最近 10 站多數決推算行政區", () => {
    expect(searchNearby(index, ORIGIN).resolved).toEqual({ city: "NTP", district: "永和區", districtSlug: "yonghe" });
    const nearZhonghe = { lat: ORIGIN.lat + 0.0072, lng: ORIGIN.lng };
    // Nearest stop is 中和線 but the other nine votes are 永和區.
    expect(searchNearby(index, nearZhonghe).resolved?.district).toBe("永和區");
  });

  it("最近站點超過 3 公里時視為服務範圍外", () => {
    const result = searchNearby(index, { lat: 24.0, lng: 120.5 });
    expect(result.resolved).toBeNull();
    expect(result.routes).toEqual([]);
    expect(result.radius).toBe(1000);
  });
});
