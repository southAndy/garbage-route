import type { GarbageStop } from "./types";

const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

export function scheduleText(days?: boolean[]) {
  const active = DAY_NAMES.filter((_, index) => days?.[index]);
  return active.length ? active.map((day) => `週${day}`).join("、") : "未提供清運日";
}

export function displayTime(stop: GarbageStop, field: "arrivalTime" | "departureTime" = "arrivalTime") {
  const value = stop[field];
  if (!value) return "時間未提供";
  return `${value}${stop.serviceDayOffset ? "（次日）" : ""}`;
}
