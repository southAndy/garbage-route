import routesData from "@/data/routes.json";
import suspiciousCoordinatesData from "@/data/suspicious-coordinates.json";
import type { SuspiciousCoordinateReport } from "./coordinate-quality";
import type { CityCode, GarbageRoute, RouteCoordinateWarning, RouteSummary } from "./types";

const routes = routesData as GarbageRoute[];
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
  return { ...route, coordinateWarnings: warningsByRoute.get(route.id) ?? [] };
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

function toSummary(route: GarbageRoute): RouteSummary {
  return {
    id: route.id,
    cityCode: route.cityCode,
    district: route.district,
    districtSlug: route.districtSlug,
    routeName: route.routeName,
    tripLabel: route.tripLabel,
    firstArrivalTime: route.firstArrivalTime,
    lastArrivalTime: route.lastArrivalTime,
    startStopName: route.stops[0]?.name ?? null,
    endStopName: route.stops.at(-1)?.name ?? null,
    stopCount: route.stopCount,
  };
}

export function findRoutes(city: CityCode, district: string, query = "") {
  const needle = query.trim().toLocaleLowerCase("zh-Hant");
  return routes
    .filter((route) => route.cityCode === city && route.district === district)
    .filter((route) => {
      if (!needle) return true;
      const searchable = [
        route.routeName,
        route.tripLabel,
        ...route.stops.flatMap((stop) => [stop.name, stop.address, stop.village]),
      ].filter(Boolean).join(" ").toLocaleLowerCase("zh-Hant");
      return searchable.includes(needle);
    })
    .map(toSummary);
}

export function getRoute(id: string) {
  return withCoordinateWarnings(routes.find((route) => route.id === id));
}

export function getRouteByPath(city: string, district: string, id: string) {
  return withCoordinateWarnings(routes.find((route) =>
    route.id === id && route.cityCode.toLowerCase() === city.toLowerCase() && route.districtSlug === district,
  ));
}
