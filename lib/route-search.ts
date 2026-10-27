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

/** Resolve an address across the district before broadening to its street. */
export function searchRoutes(routes: GarbageRoute[], query: string): RouteSummary[] {
  const find = (term: string) => routes.map((route) => searchRoute(route, term))
    .filter((result): result is RouteSummary => result !== null);
  const direct = find(query);
  if (direct.length || !query.trim()) return direct;

  // Recognize known streets even inside conversational text, without guessing
  // where a name starts in phrases such as「我家是住在景新街…」.
  const compact = query.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0)).replace(/\s+/g, "");
  const streets = new Set<string>();
  for (const route of routes) {
    for (const stop of route.stops) {
      for (const text of [stop.address, stop.name]) {
        const local = (text ?? "").replace(/^(?:臺北市|台北市|新北市)/, "").replace(new RegExp(`^${route.district}`), "");
        const street = local.match(/^[\p{Script=Han}]{1,12}?(?:大道|路|街)(?:[一二三四五六七八九十\d]+段)?/u)?.[0];
        if (street && compact.includes(street)) streets.add(street);
      }
    }
  }
  const candidates = [...streets].filter((street) => ![...streets].some((other) => other !== street && other.includes(street)));
  // An intersection can contain multiple streets; do not silently pick one.
  if (candidates.length !== 1) return [];
  const street = candidates[0];
  const tail = compact.slice(compact.indexOf(street) + street.length);
  const addressPart = tail.match(/^(?:\d+(?:之\d+)?(?:巷|弄|號)(?:之\d+)?)+/)?.[0] ?? "";
  const address = street + addressPart;
  const exact = find(address);
  const broadened = addressPart !== "" && exact.length === 0;
  const matchedQuery = broadened ? street : address;
  return (broadened ? find(street) : exact).map((result) => ({
    ...result,
    matches: result.matches && { ...result.matches, query: matchedQuery, broadened },
  }));
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
