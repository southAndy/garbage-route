import { describe, expect, it } from "vitest";
import { classifyStopTime, minutesUntil, nearbyRouteTiming, parseTime, partitionNearbyRoutes, taipeiClock } from "./stop-timing";
import type { NearbyRoute } from "./nearby-search";

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
});
