import routesData from "@/data/routes.json";
import manifestData from "@/data/manifest.json";
import suspiciousCoordinatesData from "@/data/suspicious-coordinates.json";
import type { SuspiciousCoordinateReport } from "./coordinate-quality";
import { createNearbyIndex, searchNearby, type GeoPoint, type NearbyIndex, type NearbyRadius } from "./nearby-search";
import { toSummary } from "./route-summary";
import { searchRoutes } from "./route-search";
import { matchedStopArea } from "./search-area";
import type { CityCode, GarbageRoute, RouteCoordinateWarning, RouteSummary } from "./types";

export { CITY_NAMES, cityPath, districtPath, parseCityCode, routePath } from "./paths";

const routes = routesData as GarbageRoute[];
const manifest = manifestData as { lastCheckedAt?: string };
const suspiciousCoordinates = suspiciousCoordinatesData as SuspiciousCoordinateReport;
const warningsByRoute = new Map<string, RouteCoordinateWarning[]>();

for (const finding of suspiciousCoordinates.findings) {
  const warning: RouteCoordinateWarning = {
    id: finding.id,
    type: finding.type,
    severity: finding.severity,
    message: finding.message,
    affectedStopIds: finding.type === "isolated_stop"
      ? [finding.stop.id]
      : [finding.fromStop.id, finding.toStop.id],
  };
  warningsByRoute.set(finding.routeId, [...(warningsByRoute.get(finding.routeId) ?? []), warning]);
}

function withCoordinateWarnings(route: GarbageRoute | undefined): GarbageRoute | null {
  if (!route) return null;
  return {
    ...route,
    source: { ...route.source, lastCheckedAt: manifest.lastCheckedAt ?? route.source.syncedAt },
    coordinateWarnings: warningsByRoute.get(route.id) ?? [],
  };
}

export const cities = [
  { code: "TPE" as const, name: "臺北市" },
  { code: "NTP" as const, name: "新北市" },
];

export function getDistricts(city: CityCode) {
  const counts = new Map<string, { name: string; slug: string; routeCount: number }>();
  for (const route of routes.filter((item) => item.cityCode === city)) {
    const previous = counts.get(route.district);
    counts.set(route.district, {
      name: route.district,
      slug: route.districtSlug,
      routeCount: (previous?.routeCount ?? 0) + 1,
    });
  }
  return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}

/** Routes of a district; with a query, only those whose name or stops match, each carrying its matched stops. */
export function findRoutes(city: CityCode, district: string, query = ""): RouteSummary[] {
  return searchRoutes(routes.filter((route) => route.cityCode === city && route.district === district), query);
}

let nearbyIndex: NearbyIndex | null = null;

export function findSearchArea(city: CityCode, district: string, query: string) {
  const scoped = routes.filter((route) => route.cityCode === city && route.district === district);
  const excluded = new Set([...warningsByRoute.values()].flat().flatMap((warning) => warning.affectedStopIds));
  return matchedStopArea(scoped, searchRoutes(scoped, query), query, excluded);
}

export function findNearby(point: GeoPoint, radius?: NearbyRadius) {
  if (!nearbyIndex) {
    const suspiciousStopIds = new Set([...warningsByRoute.values()].flat().flatMap((warning) => warning.affectedStopIds));
    nearbyIndex = createNearbyIndex(routes, suspiciousStopIds);
  }
  return searchNearby(nearbyIndex, point, radius);
}

export function getRoute(id: string) {
  return withCoordinateWarnings(routes.find((route) => route.id === id));
}

export function getRouteByPath(city: string, district: string, id: string) {
  return withCoordinateWarnings(routes.find((route) =>
    route.id === id && route.cityCode.toLowerCase() === city.toLowerCase() && route.districtSlug === district,
  ));
}

export function getDistrictBySlug(city: CityCode, slug: string) {
  return getDistricts(city).find((item) => item.slug === slug) ?? null;
}

export function getRouteSummariesByDistrictSlug(city: CityCode, slug: string) {
  return routes
    .filter((route) => route.cityCode === city && route.districtSlug === slug)
    .map(toSummary)
    .sort((a, b) => a.routeName.localeCompare(b.routeName, "zh-Hant") || (a.tripLabel ?? "").localeCompare(b.tripLabel ?? "", "zh-Hant"));
}

export function getAllDistrictPaths() {
  return cities.flatMap((city) => getDistricts(city.code).map((district) => ({ city: city.code.toLowerCase(), district: district.slug })));
}

export function getAllRoutePaths() {
  return routes.map((route) => ({ city: route.cityCode.toLowerCase(), district: route.districtSlug, routeId: route.id }));
}
