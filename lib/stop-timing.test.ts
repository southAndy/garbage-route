import { describe, expect, it } from "vitest";
import { classifyStopTime, closestUpcomingRouteId, minutesUntil, nearbyRouteTiming, parseTime, partitionNearbyRoutes, partitionSearchResults, routeSpanLabel, searchRouteTiming, taipeiClock } from "./stop-timing";
import type { NearbyRoute } from "./nearby-search";
import type { MatchedStop, RouteSummary } from "./types";

const everyDay = [true, true, true, true, true, true, true];
const monWedFri = [false, true, false, true, false, true, false];
// Monday 19:00 Taipei.
const monEvening = { weekday: 1, minutes: 19 * 60 };

function nearbyRoute(id: string, nearby: Partial<NearbyRoute["nearby"]>): NearbyRoute {
  return {
    id, cityCode: "NTP", district: "永和區", districtSlug: "yonghe", routeName: id, tripLabel: null,
    firstArrivalTime: "18:00", lastArrivalTime: "21:00", startStopName: null, endStopName: null, stopCount: 10,
    nearby: { count: 1, stops: [], nearestDistanceMeters: 100, firstTime: "19:10", firstTimeOffset: 0, lastTime: "19:20", lastTimeOffset: 0, serviceDays: null, ...nearby },
  };
}

describe("taipeiClock / parseTime", () => {
  it("以台北時區換算星期與分鐘", () => {
    // 2026-10-12 is a Monday. 23:30 UTC on Sunday is 07:30 Monday in Taipei.
    expect(taipeiClock(new Date("2026-10-11T23:30:00Z"))).toEqual({ weekday: 1, minutes: 7 * 60 + 30 });
  });

  it("只接受 HH:mm", () => {
    expect(parseTime("19:05")).toBe(19 * 60 + 5);
    expect(parseTime("7:05")).toBe(7 * 60 + 5);
    expect(parseTime(null)).toBeNull();
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("晚上")).toBeNull();
  });
});

describe("classifyStopTime", () => {
  it("同一天的站點依現在時間分成接下來或已過", () => {
    expect(classifyStopTime({ scheduledTime: "19:10", serviceDayOffset: 0, serviceDays: everyDay }, monEvening)).toBe("upcoming");
    expect(classifyStopTime({ scheduledTime: "18:50", serviceDayOffset: 0, serviceDays: everyDay }, monEvening)).toBe("passed");
    expect(classifyStopTime({ scheduledTime: "19:00", serviceDayOffset: 0, serviceDays: everyDay }, monEvening)).toBe("upcoming");
  });

  it("今天不是清運日時標示今日不收，沒有排程資料時不猜清運日", () => {
    const tueEvening = { weekday: 2, minutes: 19 * 60 };
    expect(classifyStopTime({ scheduledTime: "19:10", serviceDayOffset: 0, serviceDays: monWedFri }, tueEvening)).toBe("notToday");
    expect(classifyStopTime({ scheduledTime: "19:10", serviceDayOffset: 0, serviceDays: null }, tueEvening)).toBe("upcoming");
    expect(classifyStopTime({ scheduledTime: null, serviceDayOffset: 0, serviceDays: everyDay }, tueEvening)).toBe("unknown");
  });

  it("跨午夜的站點以前一天的清運日判斷", () => {
    const stop = { scheduledTime: "00:30", serviceDayOffset: 1, serviceDays: monWedFri };
    // Tuesday 00:10: Monday's service is still on its way.
    expect(classifyStopTime(stop, { weekday: 2, minutes: 10 })).toBe("upcoming");
    // Tuesday 01:00: Monday's service passed and Tuesday has no service.
    expect(classifyStopTime(stop, { weekday: 2, minutes: 60 })).toBe("passed");
    // Monday 23:00: tonight's service arrives after midnight.
    expect(classifyStopTime(stop, { weekday: 1, minutes: 23 * 60 })).toBe("upcoming");
    // Sunday 23:00: neither Saturday nor Sunday serves.
    expect(classifyStopTime(stop, { weekday: 0, minutes: 23 * 60 })).toBe("notToday");
  });
});

describe("minutesUntil", () => {
  it("計算距離表定時間的分鐘數，跨午夜要加一天", () => {
    expect(minutesUntil({ scheduledTime: "19:25", serviceDayOffset: 0, serviceDays: everyDay }, monEvening)).toBe(25);
    expect(minutesUntil({ scheduledTime: "00:30", serviceDayOffset: 1, serviceDays: everyDay }, { weekday: 1, minutes: 23 * 60 })).toBe(90);
    expect(minutesUntil({ scheduledTime: "00:30", serviceDayOffset: 1, serviceDays: everyDay }, { weekday: 2, minutes: 10 })).toBe(20);
    expect(minutesUntil({ scheduledTime: "18:00", serviceDayOffset: 0, serviceDays: everyDay }, monEvening)).toBeNull();
  });
});

describe("nearbyRouteTiming / partitionNearbyRoutes", () => {
  it("以範圍內最後一站判斷路線是否還會來，下一班取還沒過的第一站", () => {
    const partly = nearbyRoute("部分已過", { firstTime: "18:50", lastTime: "19:20" });
    expect(nearbyRouteTiming(partly, monEvening)).toEqual({ status: "upcoming", minutesUntilNext: 20 });
    const allPassed = nearbyRoute("全部已過", { firstTime: "18:00", lastTime: "18:30" });
    expect(nearbyRouteTiming(allPassed, monEvening)).toEqual({ status: "passed", minutesUntilNext: null });
  });

  it("接下來的路線依最近一班排序，已過或不收的依距離排序", () => {
    const routes = [
      nearbyRoute("已過近", { firstTime: "18:00", lastTime: "18:30", nearestDistanceMeters: 50 }),
      nearbyRoute("晚一點", { firstTime: "20:00", lastTime: "20:10", nearestDistanceMeters: 20 }),
      nearbyRoute("快到了", { firstTime: "19:05", lastTime: "19:15", nearestDistanceMeters: 300 }),
      nearbyRoute("今日不收", { firstTime: "19:05", lastTime: "19:15", serviceDays: [false, false, true, false, false, false, false], nearestDistanceMeters: 10 }),
      nearbyRoute("時間未提供", { firstTime: null, lastTime: null, nearestDistanceMeters: 80 }),
    ];
    const { upcoming, later } = partitionNearbyRoutes(routes, monEvening);
    expect(upcoming.map((item) => item.route.id)).toEqual(["快到了", "晚一點", "時間未提供"]);
    expect(later.map((item) => item.route.id)).toEqual(["今日不收", "已過近"]);
    expect(later.map((item) => item.timing.status)).toEqual(["notToday", "passed"]);
  });

  it("切成距離排序時，接下來的路線改依最近站點排，已過或不收的不受影響", () => {
    const routes = [
      nearbyRoute("已過近", { firstTime: "18:00", lastTime: "18:30", nearestDistanceMeters: 50 }),
      nearbyRoute("晚一點", { firstTime: "20:00", lastTime: "20:10", nearestDistanceMeters: 20 }),
      nearbyRoute("快到了", { firstTime: "19:05", lastTime: "19:15", nearestDistanceMeters: 300 }),
      nearbyRoute("同距離較早", { firstTime: "19:30", lastTime: "19:40", nearestDistanceMeters: 300 }),
    ];
    const { upcoming, later } = partitionNearbyRoutes(routes, monEvening, "distance");
    expect(upcoming.map((item) => item.route.id)).toEqual(["晚一點", "快到了", "同距離較早"]);
    expect(later.map((item) => item.route.id)).toEqual(["已過近"]);
    expect(partitionNearbyRoutes(routes, monEvening).upcoming.map((item) => item.route.id)).toEqual(["快到了", "同距離較早", "晚一點"]);
  });

  it("時間排序下找出離使用者最近的路線，只有一條時不標示", () => {
    const routes = [
      nearbyRoute("晚一點", { firstTime: "20:00", lastTime: "20:10", nearestDistanceMeters: 20 }),
      nearbyRoute("快到了", { firstTime: "19:05", lastTime: "19:15", nearestDistanceMeters: 300 }),
    ];
    const { upcoming } = partitionNearbyRoutes(routes, monEvening);
    expect(upcoming[0].route.id).toBe("快到了");
    expect(closestUpcomingRouteId(upcoming)).toBe("晚一點");
    expect(closestUpcomingRouteId(upcoming.slice(0, 1))).toBeNull();
  });
});

describe("routeSpanLabel / searchRouteTiming / partitionSearchResults", () => {
  // Saturday 13:05 Taipei.
  const satNoon = { weekday: 6, minutes: 13 * 60 + 5 };
  const serviceDays = [false, true, true, false, true, true, true];
  function summary(id: string, matches?: RouteSummary["matches"], first: string | null = "12:56", last: string | null = "14:32"): RouteSummary {
    return { id, cityCode: "NTP", district: "永和區", districtSlug: "yonghe", routeName: id, tripLabel: null, firstArrivalTime: first, lastArrivalTime: last, startStopName: null, endStopName: null, stopCount: 10, matches };
  }
  function matched(stopId: string, scheduledTime: string | null, days: boolean[] | null = serviceDays): MatchedStop {
    return { stopId, sequence: 1, name: stopId, scheduledTime, serviceDayOffset: 0, serviceDays: days };
  }

  it("整條路線相對於現在的狀態文字", () => {
    expect(routeSpanLabel(summary("a"), satNoon)).toBe("行駛中");
    expect(routeSpanLabel(summary("a", undefined, "18:45", "20:25"), satNoon)).toBe("今晚 18:45 起");
    expect(routeSpanLabel(summary("a", undefined, "13:30", "15:00"), satNoon)).toBe("今天 13:30 起");
    expect(routeSpanLabel(summary("a", undefined, "08:00", "09:30"), satNoon)).toBe("已過表定時間");
    expect(routeSpanLabel(summary("a", undefined, null, null), satNoon)).toBeNull();
  });

  it("搜尋結果以第一個還沒到的匹配站點為準", () => {
    const timing = searchRouteTiming(summary("a", { count: 3, stops: [matched("s1", "12:57"), matched("s2", "13:08"), matched("s3", "13:31")] }), satNoon);
    expect(timing).toEqual({ status: "upcoming", nextIndex: 1, minutesUntilNext: 3 });
    expect(searchRouteTiming(summary("b", { count: 1, stops: [matched("s1", "12:57")] }), satNoon)).toEqual({ status: "passed", nextIndex: -1, minutesUntilNext: null });
    const weekday = [false, true, true, true, true, true, false];
    expect(searchRouteTiming(summary("c", { count: 1, stops: [matched("s1", "13:30", weekday)] }), satNoon).status).toBe("notToday");
    expect(searchRouteTiming(summary("d", { count: 1, stops: [matched("s1", null)] }), satNoon).status).toBe("unknown");
  });

  it("只有路線名稱符合時退回整條路線的時段", () => {
    expect(searchRouteTiming(summary("a", { count: 0, stops: [] }), satNoon)).toEqual({ status: "upcoming", nextIndex: -1, minutesUntilNext: 0 });
    expect(searchRouteTiming(summary("a", { count: 0, stops: [] }, "18:45", "20:25"), satNoon).minutesUntilNext).toBe(5 * 60 + 40);
    expect(searchRouteTiming(summary("a", { count: 0, stops: [] }, "08:00", "09:00"), satNoon).status).toBe("passed");
  });

  it("還會到的依最快抵達排序，已過的依名稱排在後面", () => {
    const routes = [
      summary("四區午13", { count: 1, stops: [matched("s1", "13:31")] }),
      summary("三區午7", { count: 1, stops: [matched("s2", "12:57")] }),
      summary("四區午12", { count: 1, stops: [matched("s3", "13:08")] }),
      summary("一區午1", { count: 1, stops: [matched("s4", "12:50")] }),
    ];
    const { upcoming, later } = partitionSearchResults(routes, satNoon);
    expect(upcoming.map((item) => item.route.id)).toEqual(["四區午12", "四區午13"]);
    expect(later.map((item) => item.route.id)).toEqual(["一區午1", "三區午7"]);
  });
});
