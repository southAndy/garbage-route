import { classifyStopTime, minutesUntil, parseTime, type StopTimeStatus, type TaipeiClock } from "./stop-timing";
import type { GarbageRoute, GarbageStop } from "./types";

export const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

/** The fields the stop-timing helpers read, taken from a full stop; garbage days stand for the service days. */
export function stopTiming(stop: GarbageStop) {
  return { scheduledTime: stop.arrivalTime, serviceDayOffset: stop.serviceDayOffset, serviceDays: stop.schedule?.garbage ?? null };
}

export function stopStatus(stop: GarbageStop, clock: TaipeiClock): StopTimeStatus {
  return classifyStopTime(stopTiming(stop), clock);
}

export function stopMinutesUntil(stop: GarbageStop, clock: TaipeiClock): number | null {
  return minutesUntil(stopTiming(stop), clock);
}

/** The first stop, in route order, the truck has not reached yet; null when none is left today. */
export function nextUpcomingStop(route: GarbageRoute, clock: TaipeiClock): GarbageStop | null {
  return route.stops.find((stop) => stopStatus(stop, clock) === "upcoming") ?? null;
}

/** Weekday (0 = Sunday) of the next service day strictly after `weekday`, within a week; null when the stop never runs. */
export function nextServiceWeekday(days: boolean[] | null, weekday: number): number | null {
  if (!days) return null;
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const candidate = (weekday + ahead) % 7;
    if (days[candidate]) return candidate;
  }
  return null;
}

export type RouteTodayKind = "running" | "upcoming" | "ended" | "notToday" | "unknown";

export interface RouteTodayStatus {
  kind: RouteTodayKind;
  /** Pill text on the status strip; null when the data cannot say. */
  label: string | null;
  /** The stop the strip points at: next upcoming, the last one when ended, the first one otherwise. */
  stop: GarbageStop | null;
  /** Lead-in before the stop, such as 下一站 or 最後一站; for notToday the next service day instead. */
  stopLead: string;
  passedCount: number;
  /** "今天（週六）有收" or the reason it is not collecting; the expanded strip's first line. */
  today: string;
  /** The rest of that line's story, e.g. how many stops are already behind; empty when nothing to add. */
  detail: string;
}

function weekdayText(weekday: number) { return `週${WEEKDAY_NAMES[weekday]}`; }

/** What the route is doing today, worked out from its stops' times and service days. */
export function routeTodayStatus(route: GarbageRoute, clock: TaipeiClock): RouteTodayStatus {
  const stops = route.stops;
  const statuses = stops.map((stop) => stopStatus(stop, clock));
  const first = stops[0] ?? null;
  const last = stops[stops.length - 1] ?? null;
  const passedCount = statuses.filter((status) => status === "passed").length;
  const nextIndex = statuses.indexOf("upcoming");
  if (stops.length === 0 || statuses.every((status) => status === "unknown")) {
    return { kind: "unknown", label: null, stop: first, stopLead: "第 1 站", passedCount, today: "表定時間未提供", detail: "" };
  }
  if (nextIndex === -1 && statuses.every((status) => status === "notToday" || status === "unknown")) {
    const days = first?.schedule?.garbage ?? null;
    const nextDay = nextServiceWeekday(days, clock.weekday);
    const lead = nextDay === null ? "下次" : `下次 ${weekdayText(nextDay)} ${first?.arrivalTime ?? ""}`.trim();
    return { kind: "notToday", label: "今天不收", stop: first, stopLead: lead, passedCount, today: `今天（${weekdayText(clock.weekday)}）不收`, detail: nextDay === null ? "" : `下次清運 ${weekdayText(nextDay)} ${first?.arrivalTime ?? ""} 起。` };
  }
  if (nextIndex === -1) {
    return { kind: "ended", label: "今天已結束", stop: last, stopLead: "最後一站", passedCount, today: `今天（${weekdayText(clock.weekday)}）有收`, detail: `全線 ${stops.length} 站的表定時間都已過。` };
  }
  const next = stops[nextIndex];
  const remaining = stops.length - nextIndex;
  if (passedCount === 0) {
    const startsAt = parseTime(next.arrivalTime);
    const label = startsAt === null ? "今天有收" : `${startsAt >= 17 * 60 ? "今晚" : "今天"} ${next.arrivalTime} 起`;
    return { kind: "upcoming", label, stop: next, stopLead: `第 ${next.sequence} 站`, passedCount, today: `今天（${weekdayText(clock.weekday)}）有收`, detail: "尚未發車。" };
  }
  return { kind: "running", label: "行駛中", stop: next, stopLead: "下一站", passedCount, today: `今天（${weekdayText(clock.weekday)}）有收`, detail: `已過 ${passedCount} 站，第 ${next.sequence} 站起還有 ${remaining} 站。` };
}

/** Popup pill for one stop: how far ahead it is, or why it is not coming. */
export function stopPillLabel(stop: GarbageStop, clock: TaipeiClock): string | null {
  const status = stopStatus(stop, clock);
  if (status === "upcoming") {
    const minutes = stopMinutesUntil(stop, clock) ?? 0;
    if (minutes <= 1) return "即將到達";
    if (minutes >= 120) return `約 ${Math.round(minutes / 60)} 小時後`;
    return `約 ${minutes} 分後`;
  }
  if (status === "passed") return "已過表定時間";
  if (status === "notToday") return "今日不收";
  return null;
}

/** Three identical weekly patterns collapse into one row; otherwise each kind keeps its own. */
export function scheduleRows(stop: GarbageStop): { label: string; days: boolean[] }[] {
  const schedule = stop.schedule;
  if (!schedule) return [];
  const rows = [["一般垃圾", schedule.garbage], ["資源回收", schedule.recycling], ["廚餘", schedule.foodScraps]] as const;
  const same = rows.every(([, days]) => days.join() === schedule.garbage.join());
  if (same) return [{ label: "一般垃圾・資源回收・廚餘", days: schedule.garbage }];
  return rows.map(([label, days]) => ({ label, days }));
}
