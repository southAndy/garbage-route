import { parseCityCode } from "./paths";
import type { CityCode } from "./types";
import type { CollectionPoint } from "./collection-points";

export type CollectionPointDistricts = Record<CityCode, string[]>;

export function readCollectionPointScope(params: Pick<URLSearchParams, "get">, districts: CollectionPointDistricts) {
  const city = parseCityCode(params.get("city") ?? undefined) ?? "TPE";
  const requested = params.get("district") ?? "";
  return { city, district: districts[city].includes(requested) ? requested : "" };
}

export function hasCollectionPointCoordinates(point: CollectionPoint): point is CollectionPoint & { latitude: number; longitude: number } {
  return point.latitude !== null && point.longitude !== null;
}

export function collectionPointNavigationUrl(point: CollectionPoint) {
  const destination = hasCollectionPointCoordinates(point)
    ? `${point.latitude},${point.longitude}`
    : `臺北市${point.district} ${point.address}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
