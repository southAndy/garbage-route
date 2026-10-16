import type { NearbyRoute } from "./nearby-search";

export type StopTimeStatus = "upcoming" | "passed" | "notToday" | "unknown";

/** Wall-clock in Taipei: weekday (0 = Sunday) and minutes since midnight. */
export interface TaipeiClock { weekday: number; minutes: number }

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

interface TimedStop {
  scheduledTime: string | null;
  serviceDayOffset: number;
  serviceDays: boolean[] | null;
}

/** Built by hand rather than with Intl so server and browser agree byte for byte. */
export function taipeiClock(now: Date = new Date()): TaipeiClock {
  const local = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  return { weekday: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export function parseTime(value: string | null): number | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < MINUTES_PER_DAY ? minutes : null;
}

function servesOn(days: boolean[] | null, weekday: number) {
  // No schedule in the source: assume it runs, and let the label say the days are unknown.
  return days ? !!days[(weekday + 7) % 7] : true;
}

/**
 * Where a scheduled stop sits relative to now. Stops after midnight
 * (serviceDayOffset 1) belong to the previous day's service: if yesterday was
 * a service day and the time is still ahead, it is this morning's; otherwise
 * it is tonight's, which is upcoming whenever today is a service day.
 */
export function classifyStopTime(stop: TimedStop, clock: TaipeiClock): StopTimeStatus {
  const scheduled = parseTime(stop.scheduledTime);
  if (scheduled === null) return "unknown";
  if (stop.serviceDayOffset > 0) {
    const yesterdayServes = servesOn(stop.serviceDays, clock.weekday - 1);
    if (yesterdayServes && clock.minutes <= scheduled) return "upcoming";
    if (servesOn(stop.serviceDays, clock.weekday)) return "upcoming";
    return yesterdayServes ? "passed" : "notToday";
  }
  if (!servesOn(stop.serviceDays, clock.weekday)) return "notToday";
  return clock.minutes <= scheduled ? "upcoming" : "passed";
}

/** Minutes from now until the stop, for ordering upcoming stops; null when not upcoming. */
export function minutesUntil(stop: TimedStop, clock: TaipeiClock): number | null {
  if (classifyStopTime(stop, clock) !== "upcoming") return null;
  const scheduled = parseTime(stop.scheduledTime) ?? 0;
  if (stop.serviceDayOffset > 0 && clock.minutes > scheduled) return scheduled + MINUTES_PER_DAY - clock.minutes;
  if (stop.serviceDayOffset > 0 && !servesOn(stop.serviceDays, clock.weekday - 1)) return scheduled + MINUTES_PER_DAY - clock.minutes;
  return scheduled - clock.minutes;
}

export interface NearbyRouteTiming { status: StopTimeStatus; minutesUntilNext: number | null }

/**
 * A route is still coming if its last in-radius stop is; in-radius stops run
 * in route order so the last one bounds the rest. The next arrival is the first
 * stop when it is still ahead, otherwise the last.
 */
export function nearbyRouteTiming(route: NearbyRoute, clock: TaipeiClock): NearbyRouteTiming {
  const { nearby } = route;
  const first = { scheduledTime: nearby.firstTime, serviceDayOffset: nearby.firstTimeOffset, serviceDays: nearby.serviceDays };
  const last = { scheduledTime: nearby.lastTime, serviceDayOffset: nearby.lastTimeOffset, serviceDays: nearby.serviceDays };
  const status = classifyStopTime(last, clock);
  if (status !== "upcoming") return { status, minutesUntilNext: null };
  return { status, minutesUntilNext: minutesUntil(first, clock) ?? minutesUntil(last, clock) };
}

export function partitionNearbyRoutes(routes: NearbyRoute[], clock: TaipeiClock) {
  const upcoming: Array<{ route: NearbyRoute; timing: NearbyRouteTiming }> = [];
  const later: Array<{ route: NearbyRoute; timing: NearbyRouteTiming }> = [];
  for (const route of routes) {
    const timing = nearbyRouteTiming(route, clock);
    (timing.status === "upcoming" || timing.status === "unknown" ? upcoming : later).push({ route, timing });
  }
  upcoming.sort((a, b) => (a.timing.minutesUntilNext ?? Infinity) - (b.timing.minutesUntilNext ?? Infinity) || a.route.nearby.nearestDistanceMeters - b.route.nearby.nearestDistanceMeters);
  later.sort((a, b) => a.route.nearby.nearestDistanceMeters - b.route.nearby.nearestDistanceMeters);
  return { upcoming, later };
}

export function stopStatusLabel(status: StopTimeStatus): string | null {
  switch (status) {
    case "passed": return "已過表定時間";
    case "notToday": return "今日不收";
    case "unknown": return "清運日未提供";
    default: return null;
  }
}
