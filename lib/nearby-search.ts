import { toSummary } from "./route-summary";
import type { CityCode, GarbageRoute, GarbageStop, RouteSummary } from "./types";

export const NEARBY_RADII = [500, 1000] as const;
export type NearbyRadius = (typeof NEARBY_RADII)[number];
export const DEFAULT_NEARBY_RADIUS: NearbyRadius = 500;
/** Stops shown per route on a nearby result card. */
export const NEARBY_STOP_PREVIEW_LIMIT = 3;
/** How many nearest stops vote on which district the user is standing in. */
export const RESOLVE_SAMPLE_SIZE = 10;
/** Beyond this distance to the nearest stop we treat the user as outside the service area. */
export const SERVICE_AREA_LIMIT_METERS = 3000;
/** Coordinates are rounded to ~100 m before use so responses are cacheable and never pinpoint a user. */
export const COORDINATE_DECIMALS = 3;

// Rough bounding box of Taiwan; anything outside is a client bug or spoofed input.
const TAIWAN_BOUNDS = { minLat: 21.5, maxLat: 25.5, minLng: 119, maxLng: 122.5 };
const EARTH_RADIUS_METERS = 6371008.8;

export interface GeoPoint { lat: number; lng: number }

export interface NearbyStop {
  stopId: string;
  name: string;
  scheduledTime: string | null;
  serviceDayOffset: number;
  distanceMeters: number;
  /** Weekday flags (index 0 = Sunday) for garbage collection at this stop; null when the source has none. */
  serviceDays: boolean[] | null;
}

export interface NearbyRoute extends RouteSummary {
  nearby: {
    /** Stops of this route inside the radius. */
    count: number;
    /** Closest stops first, at most NEARBY_STOP_PREVIEW_LIMIT. */
    stops: NearbyStop[];
    nearestDistanceMeters: number;
    /** Scheduled span over the in-radius stops only, in route order. */
    firstTime: string | null;
    firstTimeOffset: number;
    lastTime: string | null;
    lastTimeOffset: number;
    /** Union of garbage-collection weekdays across in-radius stops; null when none has a schedule. */
    serviceDays: boolean[] | null;
  };
}

export interface ResolvedArea { city: CityCode; district: string; districtSlug: string }

export interface NearbyResult {
  radius: NearbyRadius;
  /** True when the requested radius was empty and results come from the next larger one. */
  expanded: boolean;
  resolved: ResolvedArea | null;
  routes: NearbyRoute[];
}

export type NearbyQuery = { ok: true; point: GeoPoint; radius: NearbyRadius } | { ok: false; code: "INVALID_LOCATION" | "INVALID_RADIUS"; message: string };

interface IndexedStop { stop: GarbageStop; route: GarbageRoute; lat: number; lng: number }

export interface NearbyIndex { stops: IndexedStop[] }

export function roundCoordinate(value: number) {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

export function haversineMeters(a: GeoPoint, b: GeoPoint) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function parseNearbyQuery(params: URLSearchParams): NearbyQuery {
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const inBounds = Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= TAIWAN_BOUNDS.minLat && lat <= TAIWAN_BOUNDS.maxLat
    && lng >= TAIWAN_BOUNDS.minLng && lng <= TAIWAN_BOUNDS.maxLng;
  if (!params.has("lat") || !params.has("lng") || !inBounds) {
    return { ok: false, code: "INVALID_LOCATION", message: "請提供有效的座標" };
  }
  const rawRadius = params.get("radius");
  const radius = rawRadius === null ? DEFAULT_NEARBY_RADIUS : Number(rawRadius);
  if (!NEARBY_RADII.includes(radius as NearbyRadius)) {
    return { ok: false, code: "INVALID_RADIUS", message: `半徑僅支援 ${NEARBY_RADII.join(" 或 ")} 公尺` };
  }
  return { ok: true, point: { lat: roundCoordinate(lat), lng: roundCoordinate(lng) }, radius: radius as NearbyRadius };
}

/** Flattens every locatable stop once; stops with known-bad coordinates are left out entirely. */
export function createNearbyIndex(routes: GarbageRoute[], excludedStopIds: ReadonlySet<string> = new Set()): NearbyIndex {
  const stops: IndexedStop[] = [];
  for (const route of routes) {
    for (const stop of route.stops) {
      if (stop.coordinateStatus !== "valid" || stop.latitude === null || stop.longitude === null) continue;
      if (excludedStopIds.has(stop.id)) continue;
      stops.push({ stop, route, lat: stop.latitude, lng: stop.longitude });
    }
  }
  return { stops };
}

function resolveArea(nearest: Array<{ entry: IndexedStop; distance: number }>): ResolvedArea | null {
  if (nearest.length === 0 || nearest[0].distance > SERVICE_AREA_LIMIT_METERS) return null;
  const votes = new Map<string, { area: ResolvedArea; count: number }>();
  for (const { entry } of nearest) {
    const key = `${entry.route.cityCode}|${entry.route.district}`;
    const current = votes.get(key);
    if (current) current.count += 1;
    else votes.set(key, { count: 1, area: { city: entry.route.cityCode, district: entry.route.district, districtSlug: entry.route.districtSlug } });
  }
  // Ties go to whichever district appeared first, i.e. holds the closest stop.
  let winner: { area: ResolvedArea; count: number } | null = null;
  for (const candidate of votes.values()) {
    if (!winner || candidate.count > winner.count) winner = candidate;
  }
  return winner?.area ?? null;
}

function unionServiceDays(stops: GarbageStop[]): boolean[] | null {
  const scheduled = stops.filter((stop) => stop.schedule);
  if (scheduled.length === 0) return null;
  return Array.from({ length: 7 }, (_, day) => scheduled.some((stop) => stop.schedule?.garbage[day]));
}

function groupByRoute(hits: Array<{ entry: IndexedStop; distance: number }>): NearbyRoute[] {
  const byRoute = new Map<string, { route: GarbageRoute; hits: Array<{ entry: IndexedStop; distance: number }> }>();
  for (const hit of hits) {
    const group = byRoute.get(hit.entry.route.id) ?? { route: hit.entry.route, hits: [] };
    group.hits.push(hit);
    byRoute.set(hit.entry.route.id, group);
  }
  return [...byRoute.values()].map(({ route, hits: routeHits }) => {
    const byDistance = [...routeHits].sort((a, b) => a.distance - b.distance);
    const bySequence = [...routeHits].sort((a, b) => a.entry.stop.sequence - b.entry.stop.sequence);
    return {
      ...toSummary(route),
      nearby: {
        count: routeHits.length,
        stops: byDistance.slice(0, NEARBY_STOP_PREVIEW_LIMIT).map(({ entry, distance }) => ({
          stopId: entry.stop.id,
          name: entry.stop.name,
          scheduledTime: entry.stop.arrivalTime,
          serviceDayOffset: entry.stop.serviceDayOffset,
          distanceMeters: Math.round(distance),
          serviceDays: entry.stop.schedule?.garbage ?? null,
        })),
        nearestDistanceMeters: Math.round(byDistance[0].distance),
        firstTime: bySequence[0]?.entry.stop.arrivalTime ?? null,
        firstTimeOffset: bySequence[0]?.entry.stop.serviceDayOffset ?? 0,
        lastTime: bySequence.at(-1)?.entry.stop.arrivalTime ?? null,
        lastTimeOffset: bySequence.at(-1)?.entry.stop.serviceDayOffset ?? 0,
        serviceDays: unionServiceDays(routeHits.map(({ entry }) => entry.stop)),
      },
    };
  }).sort((a, b) => a.nearby.nearestDistanceMeters - b.nearby.nearestDistanceMeters || a.routeName.localeCompare(b.routeName, "zh-Hant"));
}

/**
 * Finds stops around a point, grouped by route and ordered by the closest stop.
 * An empty radius falls back to the next larger one; the district is inferred
 * from the nearest stops so the UI can preselect it.
 */
export function searchNearby(index: NearbyIndex, point: GeoPoint, radius: NearbyRadius = DEFAULT_NEARBY_RADIUS): NearbyResult {
  const largest = NEARBY_RADII[NEARBY_RADII.length - 1];
  const candidates: Array<{ entry: IndexedStop; distance: number }> = [];
  const nearest: Array<{ entry: IndexedStop; distance: number }> = [];
  for (const entry of index.stops) {
    const distance = haversineMeters(point, entry);
    if (distance <= largest) candidates.push({ entry, distance });
    if (nearest.length < RESOLVE_SAMPLE_SIZE || distance < nearest[nearest.length - 1].distance) {
      const at = nearest.findIndex((item) => distance < item.distance);
      nearest.splice(at === -1 ? nearest.length : at, 0, { entry, distance });
      if (nearest.length > RESOLVE_SAMPLE_SIZE) nearest.pop();
    }
  }
  const resolved = resolveArea(nearest);
  const startIndex = NEARBY_RADII.indexOf(radius);
  for (let i = startIndex; i < NEARBY_RADII.length; i += 1) {
    const current = NEARBY_RADII[i];
    const hits = candidates.filter((item) => item.distance <= current);
    if (hits.length > 0 || i === NEARBY_RADII.length - 1) {
      return { radius: current, expanded: i > startIndex, resolved, routes: groupByRoute(hits) };
    }
  }
  return { radius, expanded: false, resolved, routes: [] };
}
