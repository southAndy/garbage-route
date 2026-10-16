import type { GarbageRoute, RouteSummary } from "./types";

export function toSummary(route: GarbageRoute): RouteSummary {
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
