import { toSummary } from "./route-summary";
import type { GarbageRoute, GarbageStop, MatchedStop, RouteSummary } from "./types";

/** Matched stops sent per route. Cards show a few, but the client picks which from the whole list, so send them all up to this cap. */
export const MATCHED_STOP_LIMIT = 40;

export function normalizeQuery(query: string) {
  return query.trim().toLocaleLowerCase("zh-Hant");
}

function stopText(stop: GarbageStop) {
  return [stop.name, stop.address, stop.village].filter(Boolean).join(" ").toLocaleLowerCase("zh-Hant");
}

export function stopMatchesQuery(stop: GarbageStop, needle: string) {
  return stopText(stop).includes(needle);
}

export function routeNameMatchesQuery(route: Pick<GarbageRoute, "routeName" | "tripLabel">, needle: string) {
  return [route.routeName, route.tripLabel].filter(Boolean).join(" ").toLocaleLowerCase("zh-Hant").includes(needle);
}

export function toMatchedStop(stop: GarbageStop): MatchedStop {
  return {
    stopId: stop.id,
    sequence: stop.sequence,
    name: stop.name,
    scheduledTime: stop.arrivalTime,
    serviceDayOffset: stop.serviceDayOffset,
    serviceDays: stop.schedule?.garbage ?? null,
  };
}

/**
 * The route's summary when it matches `query`, carrying the stops that matched so a result
 * card can say which stop on the searched street the truck reaches and when. A route whose
 * name matches but has no matching stop gets an empty `matches`. Null when nothing matches;
 * an empty query matches every route and adds no `matches`.
 */
export function searchRoute(route: GarbageRoute, query: string): RouteSummary | null {
  const needle = normalizeQuery(query);
  if (!needle) return toSummary(route);
  const matched = route.stops.filter((stop) => stopMatchesQuery(stop, needle));
  if (matched.length === 0 && !routeNameMatchesQuery(route, needle)) return null;
  return { ...toSummary(route), matches: { count: matched.length, stops: matched.slice(0, MATCHED_STOP_LIMIT).map(toMatchedStop) } };
}

/** Splits `text` into [plain, match, plain, match, …] so a card can highlight the searched word. */
export function splitByQuery(text: string, query: string): string[] {
  const needle = normalizeQuery(query);
  if (!needle) return [text];
  const lower = text.toLocaleLowerCase("zh-Hant");
  const parts: string[] = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at === -1) { parts.push(text.slice(from)); break; }
    parts.push(text.slice(from, at), text.slice(at, at + needle.length));
    from = at + needle.length;
  }
  return parts;
}
