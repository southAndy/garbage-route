import type { GarbageRoute, RouteSummary } from "./types";

export interface SearchArea {
  bounds: [[number, number], [number, number]];
  count: number;
  query: string;
}

/** Only matching, trusted stops contribute; never the whole route geometry. */
export function matchedStopArea(routes: GarbageRoute[], matches: RouteSummary[], query: string, excluded: ReadonlySet<string>): SearchArea | null {
  const ids = new Set(matches.flatMap((route) => route.matches?.stops.map((stop) => stop.stopId) ?? []));
  const points = new Map<string, [number, number]>();
  for (const route of routes) for (const stop of route.stops) {
    if (!ids.has(stop.id) || excluded.has(stop.id) || stop.coordinateStatus !== "valid" || stop.longitude === null || stop.latitude === null) continue;
    if (!Number.isFinite(stop.longitude) || !Number.isFinite(stop.latitude)) continue;
    points.set(`${stop.longitude},${stop.latitude}`, [stop.longitude, stop.latitude]);
  }
  const coordinates = [...points.values()];
  if (!coordinates.length) return null;
  return {
    bounds: [[Math.min(...coordinates.map(([lng]) => lng)), Math.min(...coordinates.map(([, lat]) => lat))], [Math.max(...coordinates.map(([lng]) => lng)), Math.max(...coordinates.map(([, lat]) => lat))]],
    count: coordinates.length,
    query: matches[0]?.matches?.query ?? query.trim(),
  };
}
