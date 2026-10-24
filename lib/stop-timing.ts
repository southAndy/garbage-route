import type { NearbyRoute } from "./nearby-search";
import type { RouteSummary } from "./types";

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

/** How upcoming nearby routes are ordered: soonest arrival first, or closest stop first. */
export type NearbySort = "time" | "distance";

type TimedRoute = { route: NearbyRoute; timing: NearbyRouteTiming };
const byTime = (a: TimedRoute, b: TimedRoute) => (a.timing.minutesUntilNext ?? Infinity) - (b.timing.minutesUntilNext ?? Infinity);
const byDistance = (a: TimedRoute, b: TimedRoute) => a.route.nearby.nearestDistanceMeters - b.route.nearby.nearestDistanceMeters;

/**
 * Splits nearby routes into those still coming today and the rest. `sort` picks
 * the primary key for the upcoming group (the other key breaks ties); routes
 * that are already passed or not serving today are always ordered by distance,
 * since they have no arrival to wait for.
 */
export function partitionNearbyRoutes(routes: NearbyRoute[], clock: TaipeiClock, sort: NearbySort = "time") {
  const upcoming: TimedRoute[] = [];
  const later: TimedRoute[] = [];
  for (const route of routes) {
    const timing = nearbyRouteTiming(route, clock);
    (timing.status === "upcoming" || timing.status === "unknown" ? upcoming : later).push({ route, timing });
  }
  upcoming.sort(sort === "distance" ? (a, b) => byDistance(a, b) || byTime(a, b) : (a, b) => byTime(a, b) || byDistance(a, b));
  later.sort(byDistance);
  return { upcoming, later };
}

/** Id of the upcoming route whose stop is closest; null unless there are at least two to compare. */
export function closestUpcomingRouteId(upcoming: TimedRoute[]): string | null {
  if (upcoming.length < 2) return null;
  return upcoming.reduce((best, item) => byDistance(item, best) < 0 ? item : best).route.id;
}

export function stopStatusLabel(status: StopTimeStatus): string | null {
  switch (status) {
    case "passed": return "已過表定時間";
    case "notToday": return "今日不收";
    case "unknown": return "清運日未提供";
    default: return null;
  }
}

export type RouteSpanStatus = "running" | "upcoming" | "ended" | "unknown";

/**
 * Where a route's whole scheduled span sits relative to now. A summary carries no service
 * days, so this only compares clock times; the label stays about the timetable, not the truck.
 */
export function routeSpanStatus(route: { firstArrivalTime: string | null; lastArrivalTime: string | null }, clock: TaipeiClock): RouteSpanStatus {
  const first = parseTime(route.firstArrivalTime);
  const last = parseTime(route.lastArrivalTime);
  if (first === null || last === null) return "unknown";
  if (clock.minutes < first) return "upcoming";
  if (clock.minutes > last) return "ended";
  return "running";
}

export function routeSpanLabel(route: { firstArrivalTime: string | null; lastArrivalTime: string | null }, clock: TaipeiClock): string | null {
  switch (routeSpanStatus(route, clock)) {
    case "running": return "行駛中";
    case "upcoming": return `${(parseTime(route.firstArrivalTime) ?? 0) >= 17 * 60 ? "今晚" : "今天"} ${route.firstArrivalTime} 起`;
    case "ended": return "已過表定時間";
    default: return null;
  }
}

export interface SearchRouteTiming {
  status: StopTimeStatus;
  /** Index into `matches.stops` of the first stop still coming; -1 when none is. */
  nextIndex: number;
  minutesUntilNext: number | null;
}

/**
 * Timing of a text-search result from its matched stops: the first one still ahead is the
 * stop the card should lead with. A route that matched by name only falls back to its span.
 */
export function searchRouteTiming(route: RouteSummary, clock: TaipeiClock): SearchRouteTiming {
  const stops = route.matches?.stops ?? [];
  if (stops.length === 0) {
    const span = routeSpanStatus(route, clock);
    if (span === "unknown") return { status: "unknown", nextIndex: -1, minutesUntilNext: null };
    if (span === "ended") return { status: "passed", nextIndex: -1, minutesUntilNext: null };
    return { status: "upcoming", nextIndex: -1, minutesUntilNext: span === "running" ? 0 : (parseTime(route.firstArrivalTime) ?? 0) - clock.minutes };
  }
  for (let index = 0; index < stops.length; index += 1) {
    const minutes = minutesUntil(stops[index], clock);
    if (minutes !== null) return { status: "upcoming", nextIndex: index, minutesUntilNext: minutes };
  }
  const statuses = stops.map((stop) => classifyStopTime(stop, clock));
  if (statuses.includes("unknown")) return { status: "unknown", nextIndex: -1, minutesUntilNext: null };
  return { status: statuses.every((status) => status === "notToday") ? "notToday" : "passed", nextIndex: -1, minutesUntilNext: null };
}

type TimedSearchRoute = { route: RouteSummary; timing: SearchRouteTiming };
const byNextArrival = (a: TimedSearchRoute, b: TimedSearchRoute) => (a.timing.minutesUntilNext ?? Infinity) - (b.timing.minutesUntilNext ?? Infinity);
const byName = (a: TimedSearchRoute, b: TimedSearchRoute) => a.route.routeName.localeCompare(b.route.routeName, "zh-Hant") || (a.route.tripLabel ?? "").localeCompare(b.route.tripLabel ?? "", "zh-Hant");

/** Search results split into those still coming (soonest matched stop first) and the rest (by name). */
export function partitionSearchResults(routes: RouteSummary[], clock: TaipeiClock) {
  const upcoming: TimedSearchRoute[] = [];
  const later: TimedSearchRoute[] = [];
  for (const route of routes) {
    const timing = searchRouteTiming(route, clock);
    (timing.status === "upcoming" || timing.status === "unknown" ? upcoming : later).push({ route, timing });
  }
  upcoming.sort((a, b) => byNextArrival(a, b) || byName(a, b));
  later.sort(byName);
  return { upcoming, later };
}
