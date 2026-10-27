import type { CityCode, GarbageRoute } from "./types";
import { CITY_NAMES } from "./paths";

export interface LocationSuggestion { city: CityCode; district: string; name: string; query: string }
const normalize = (value: string) => value.normalize("NFKC").replace(/台/g, "臺").replace(/\s+/g, "").toLowerCase();
export function createLocationIndex(routes: GarbageRoute[]) {
  const streets = new Map<string, LocationSuggestion>();
  const stops = new Map<string, LocationSuggestion>();
  for (const route of routes) for (const stop of route.stops) {
    const local = (stop.address || stop.name).replace(/^(?:臺北市|台北市|新北市)/, "").replace(new RegExp(`^${route.district}`), "");
    const street = local.match(/^[\p{Script=Han}]{1,12}?(?:大道|路|街)(?:[一二三四五六七八九十\d]+段)?/u)?.[0];
    for (const [map, name] of [[streets, street], [stops, stop.name]] as const) {
      if (name) map.set(`${route.cityCode}|${route.district}|${name}`, { city: route.cityCode, district: route.district, name, query: name });
    }
  }
  return { streets: [...streets.values()], stops: [...stops.values()] };
}

export function suggestLocations(index: ReturnType<typeof createLocationIndex>, text: string) {
  const needle = normalize(text);
  if (!needle) return [];
  const areaNeedle = needle.replace(/^(?:新北市?|臺北市?)/, "");
  const districts = [...new Set(index.streets.map((item) => item.district))].filter((name) => {
    if (needle.includes(name)) return true;
    const short = name.replace(/區$/, "");
    const rest = areaNeedle.slice(short.length);
    return areaNeedle.startsWith(short) && Boolean(rest) && !/^(?:路|街|大道)/.test(rest);
  });
  const cities = Object.entries(CITY_NAMES).filter(([, name]) => needle.includes(normalize(name))).map(([code]) => code);
  const matches = (item: LocationSuggestion) => {
    if (districts.length && !districts.includes(item.district)) return false;
    if (cities.length && !cities.includes(item.city)) return false;
    const full = normalize(`${CITY_NAMES[item.city]}${item.district}${item.name}`);
    const shortArea = normalize(`${item.district.replace(/區$/, "")}${item.name}`);
    const shortFull = normalize(`${CITY_NAMES[item.city].replace(/市$/, "")}${item.district.replace(/區$/, "")}${item.name}`);
    return full.includes(needle) || shortArea.includes(needle) || shortFull.includes(needle) || needle.includes(normalize(item.name));
  };
  const streets = index.streets.filter(matches);
  return (streets.length ? streets : index.stops.filter(matches))
    .sort((a, b) => Number(normalize(b.name) === needle) - Number(normalize(a.name) === needle) || a.name.localeCompare(b.name, "zh-Hant") || a.district.localeCompare(b.district, "zh-Hant"))
    .slice(0, 30).map((item) => ({ ...item, query: needle.includes(normalize(item.name)) ? text.trim() : item.name }));
}
