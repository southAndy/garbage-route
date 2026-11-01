import type { CityCode, GarbageRoute } from "./types";

export const CITY_NAMES: Record<CityCode, string> = { TPE: "臺北市", NTP: "新北市" };

export function parseCityCode(value: string | undefined): CityCode | null {
  const upper = value?.toUpperCase();
  return upper === "TPE" || upper === "NTP" ? upper : null;
}

export function cityPath(city: CityCode) {
  return `/routes/${city.toLowerCase()}`;
}

export function districtPath(city: CityCode, districtSlug: string) {
  return `${cityPath(city)}/${districtSlug}`;
}

export function routePath(route: Pick<GarbageRoute, "cityCode" | "districtSlug" | "id">) {
  return `${districtPath(route.cityCode, route.districtSlug)}/${route.id}`;
}

/** Keep the route's area when offering an alternative collection location. */
export function collectionPointsPath(city?: CityCode, district = "") {
  if (!city) return "/collection-points";
  const params = new URLSearchParams({ city });
  if (district) params.set("district", district);
  return `/collection-points?${params}`;
}
