import { describe, expect, it } from "vitest";
import { nextServiceWeekday, nextUpcomingStop, routeTodayStatus, scheduleRows, stopPillLabel } from "./route-status";
import type { GarbageRoute, GarbageStop } from "./types";

const days = [false, true, true, false, true, true, true];
function stop(sequence: number, name: string, arrivalTime: string | null, schedule = days): GarbageStop {
  return { id: `s${sequence}`, routeId: "r", sequence, name, address: name, village: "和平里", longitude: 121.5, latitude: 25, arrivalTime, departureTime: null, serviceDayOffset: 0, memo: null, schedule: { garbage: schedule, recycling: schedule, foodScraps: schedule }, coordinateStatus: "valid" };
}
const route: GarbageRoute = {
  id: "ntp-234001", cityCode: "NTP", district: "永和區", districtSlug: "yonghe", sourceRouteId: null, routeName: "三區午7", tripLabel: null,
  teamName: null, vehicleCode: null, licensePlate: null, firstArrivalTime: "12:56", lastArrivalTime: "14:32", stopCount: 4, geometry: null,
  stops: [stop(1, "永和路一段157號", "12:56"), stop(2, "永平路25號", "12:58"), stop(3, "永平路164號", "13:08"), stop(4, "大新街76號", "14:32")],
  source: { name: "新北市垃圾車路線", url: "https://example.test", sourceUpdatedAt: null, syncedAt: "2026-10-09T01:17:08.497Z" },
};
const sat = (minutes: number) => ({ weekday: 6, minutes });

describe("routeTodayStatus", () => {
  it("行駛中：指向下一個還沒到的站，並數出已過的站", () => {
    const status = routeTodayStatus(route, sat(13 * 60 + 5));
    expect(status.kind).toBe("running");
    expect(status.label).toBe("行駛中");
    expect(status.stop?.id).toBe("s3");
    expect(status.stopLead).toBe("下一站");
    expect(status.passedCount).toBe(2);
    expect(status.today).toBe("今天（週六）有收");
    expect(status.detail).toBe("已過 2 站，第 3 站起還有 2 站。");
    expect(nextUpcomingStop(route, sat(13 * 60 + 5))?.id).toBe("s3");
  });

  it("還沒發車：標出幾點起，傍晚以後寫今晚", () => {
    expect(routeTodayStatus(route, sat(11 * 60)).label).toBe("今天 12:56 起");
    expect(routeTodayStatus(route, sat(11 * 60)).stopLead).toBe("第 1 站");
    const evening = { ...route, stops: route.stops.map((item) => ({ ...item, arrivalTime: "18:56" })) };
    expect(routeTodayStatus(evening, sat(11 * 60)).label).toBe("今晚 18:56 起");
  });

  it("已跑完：指向最後一站", () => {
    const status = routeTodayStatus(route, sat(15 * 60 + 10));
    expect(status.kind).toBe("ended");
    expect(status.label).toBe("今天已結束");
    expect(status.stop?.id).toBe("s4");
    expect(status.stopLead).toBe("最後一站");
    expect(nextUpcomingStop(route, sat(15 * 60 + 10))).toBeNull();
  });

  it("今天不收：指向下一個清運日", () => {
    const status = routeTodayStatus(route, { weekday: 3, minutes: 13 * 60 });
    expect(status.kind).toBe("notToday");
    expect(status.label).toBe("今天不收");
    expect(status.stopLead).toBe("下次 週四 12:56");
    expect(status.today).toBe("今天（週三）不收");
    expect(status.detail).toBe("下次清運 週四 12:56 起。");
    expect(nextServiceWeekday(days, 6)).toBe(1);
    expect(nextServiceWeekday([false, false, false, false, false, false, false], 6)).toBeNull();
    expect(nextServiceWeekday(null, 6)).toBeNull();
  });

  it("沒有時間資料時不給標籤", () => {
    const blank = { ...route, stops: route.stops.map((item) => ({ ...item, arrivalTime: null })) };
    expect(routeTodayStatus(blank, sat(13 * 60)).kind).toBe("unknown");
    expect(routeTodayStatus(blank, sat(13 * 60)).label).toBeNull();
  });
});

describe("stopPillLabel / scheduleRows", () => {
  it("依站點狀態給藥丸文字", () => {
    expect(stopPillLabel(route.stops[2], sat(13 * 60 + 5))).toBe("約 3 分後");
    expect(stopPillLabel(route.stops[2], sat(13 * 60 + 7))).toBe("即將到達");
    expect(stopPillLabel(route.stops[3], sat(11 * 60))).toBe("約 4 小時後");
    expect(stopPillLabel(route.stops[1], sat(13 * 60 + 5))).toBe("已過表定時間");
    expect(stopPillLabel(route.stops[2], { weekday: 3, minutes: 13 * 60 })).toBe("今日不收");
    expect(stopPillLabel({ ...route.stops[2], arrivalTime: null }, sat(13 * 60))).toBeNull();
  });

  it("三類清運日相同就合併成一列，否則各一列", () => {
    expect(scheduleRows(route.stops[0])).toEqual([{ label: "一般垃圾・資源回收・廚餘", days }]);
    const tue = [false, false, true, false, false, false, false];
    const mixed = { ...route.stops[0], schedule: { garbage: days, recycling: tue, foodScraps: days } };
    expect(scheduleRows(mixed).map((row) => row.label)).toEqual(["一般垃圾", "資源回收", "廚餘"]);
    expect(scheduleRows({ ...route.stops[0], schedule: null })).toEqual([]);
  });
});
