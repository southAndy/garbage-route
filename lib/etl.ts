import type { GarbageRoute, GarbageStop, CityCode, CollectionSchedule } from "./types";
import { districtSlug, normalizeCoordinate, normalizeTime, stableRouteId } from "./normalize";

type CsvRow = Record<string, string>;
type SourceMeta = { name: string; url: string; sourceUpdatedAt: string | null; syncedAt: string; stale?: boolean };

const pick = (row: CsvRow, aliases: string[]) => {
  const key = aliases.find((alias) => Object.prototype.hasOwnProperty.call(row, alias));
  return key ? String(row[key] ?? "").trim() : "";
};

const boolDays = (value: string) => {
  const result = Array<boolean>(7).fill(false);
  const normalized = value.replace(/星期|週/g, "").replace(/、|，|;|；/g, ",");
  const labels = ["日", "一", "二", "三", "四", "五", "六"];
  labels.forEach((label, index) => { result[index] = normalized.includes(label); });
  if (/^[01]{7}$/.test(normalized)) return normalized.split("").map((bit) => bit === "1");
  return result;
};

const scheduleFromRow = (row: CsvRow): CollectionSchedule | null => {
  const garbage = pick(row, ["garbage", "一般垃圾", "一般垃圾收運日", "garbageweek"]);
  const recycling = pick(row, ["recycling", "資源回收", "資源回收日", "recyclingweek"]);
  const food = pick(row, ["foodscreaps", "foodscraps", "廚餘", "廚餘收運日", "foodscrapsweek"]);
  const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const columnSchedule = {
    garbage: dayKeys.map((day) => /^(y|yes|1|true)$/i.test(pick(row, [`garbage${day}`]))),
    recycling: dayKeys.map((day) => /^(y|yes|1|true)$/i.test(pick(row, [`recycling${day}`]))),
    foodScraps: dayKeys.map((day) => /^(y|yes|1|true)$/i.test(pick(row, [`foodscraps${day}`, `foodscreaps${day}`]))),
  };
  if (Object.values(columnSchedule).some((days) => days.some(Boolean))) return columnSchedule;
  if (!garbage && !recycling && !food) return null;
  return { garbage: boolDays(garbage), recycling: boolDays(recycling), foodScraps: boolDays(food) };
};

function createGeometry(stops: GarbageStop[]): GeoJSON.LineString | null {
  const coordinates = stops.filter((stop) => stop.coordinateStatus === "valid").map((stop) => [stop.longitude!, stop.latitude!]);
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
}

function finalizeRoute(base: Omit<GarbageRoute, "stops" | "geometry" | "stopCount" | "firstArrivalTime" | "lastArrivalTime">, stops: GarbageStop[]) {
  return {
    ...base,
    firstArrivalTime: stops[0]?.arrivalTime ?? null,
    lastArrivalTime: stops.at(-1)?.arrivalTime ?? null,
    stopCount: stops.length,
    geometry: createGeometry(stops),
    stops,
  } satisfies GarbageRoute;
}

export function normalizeTaipei(rows: CsvRow[], source: SourceMeta): GarbageRoute[] {
  const groups = new Map<string, { parts: string[]; rows: Array<{ row: CsvRow; index: number }> }>();
  rows.forEach((row, index) => {
    const district = pick(row, ["行政區", "district"]);
    const team = pick(row, ["分隊", "team"]);
    const routeName = pick(row, ["路線", "路線名稱", "route"]);
    const trip = pick(row, ["車次", "trip"]);
    if (!district || !routeName) return;
    const parts = ["TPE", district, team, routeName, trip];
    const key = parts.join("|");
    const group = groups.get(key) ?? { parts, rows: [] };
    group.rows.push({ row, index }); groups.set(key, group);
  });
  return [...groups.values()].map(({ parts, rows: groupRows }) => {
    const [, district, team, routeName, trip] = parts;
    const id = stableRouteId(parts, `tpe-${districtSlug("TPE", district)}`);
    const ordered = groupRows.sort((a, b) => {
      const at = normalizeTime(pick(a.row, ["抵達時間", "arrival_time", "time"]));
      const bt = normalizeTime(pick(b.row, ["抵達時間", "arrival_time", "time"]));
      return (at?.sortMinutes ?? Number.MAX_SAFE_INTEGER) - (bt?.sortMinutes ?? Number.MAX_SAFE_INTEGER) || a.index - b.index;
    });
    const stops = ordered.map(({ row }, index): GarbageStop => {
      const arrival = normalizeTime(pick(row, ["抵達時間", "arrival_time", "time"]));
      const departure = normalizeTime(pick(row, ["離開時間", "departure_time"]));
      const coordinate = normalizeCoordinate(pick(row, ["經度", "longitude", "lon"]), pick(row, ["緯度", "latitude", "lat"]));
      const name = pick(row, ["地點", "name", "清運點"]) || "未命名停靠點";
      return { id:`${id}-stop-${index + 1}`, routeId:id, sequence:index + 1, name, address:name, village:pick(row,["里別","village"]) || null, longitude:coordinate.longitude, latitude:coordinate.latitude, arrivalTime:arrival?.displayTime ?? null, departureTime:departure?.displayTime ?? null, serviceDayOffset:arrival?.serviceDayOffset ?? 0, memo:null, schedule:null, coordinateStatus:coordinate.status };
    });
    return finalizeRoute({ id, cityCode:"TPE", district, districtSlug:districtSlug("TPE",district), sourceRouteId:null, routeName, tripLabel:trip || null, teamName:team || null, vehicleCode:pick(groupRows[0].row,["局編"]) || null, licensePlate:pick(groupRows[0].row,["車號"]) || null, source }, stops);
  });
}

export function normalizeNewTaipei(rows: CsvRow[], source: SourceMeta): GarbageRoute[] {
  const groups = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const lineId = pick(row, ["lineid", "lineId", "路線編號"]);
    if (!lineId) continue;
    groups.set(lineId, [...(groups.get(lineId) ?? []), row]);
  }
  return [...groups.entries()].map(([lineId, groupRows]) => {
    const id = `ntp-${lineId.toLowerCase()}`;
    const ordered = groupRows.sort((a, b) => Number(pick(a,["rank","清運順序"]) || Number.MAX_SAFE_INTEGER) - Number(pick(b,["rank","清運順序"]) || Number.MAX_SAFE_INTEGER));
    const district = pick(ordered[0], ["city", "cityteam", "district", "行政區", "區隊"]).replace(/清潔隊$/, "") || "未分類";
    const stops = ordered.map((row, index): GarbageStop => {
      const arrival = normalizeTime(pick(row, ["time", "表定時間", "arrivaltime"]));
      const coordinate = normalizeCoordinate(pick(row,["longitude","經度","lon"]),pick(row,["latitude","緯度","lat"]));
      const name = pick(row,["name","清運點","location"]) || "未命名停靠點";
      return { id:`${id}-stop-${index + 1}`, routeId:id, sequence:index + 1, name, address:pick(row,["address","地址"]) || name, village:pick(row,["village","里別"]) || null, longitude:coordinate.longitude, latitude:coordinate.latitude, arrivalTime:arrival?.displayTime ?? null, departureTime:null, serviceDayOffset:arrival?.serviceDayOffset ?? 0, memo:pick(row,["memo","清運備註","remark"]) || null, schedule:scheduleFromRow(row), coordinateStatus:coordinate.status };
    });
    return finalizeRoute({ id, cityCode:"NTP", district, districtSlug:districtSlug("NTP",district), sourceRouteId:lineId, routeName:pick(ordered[0],["linename","路線名稱","routeName"]) || `路線 ${lineId}`, tripLabel:null, teamName:null, vehicleCode:null, licensePlate:null, source }, stops);
  });
}

export function qualityCheck(city: CityCode, routes: GarbageRoute[], previous: GarbageRoute[]) {
  const errors: string[] = [];
  if (!routes.length) errors.push(`${city}: 無法建立任何路線`);
  if (!routes.some((route) => route.stops.some((stop) => stop.coordinateStatus === "valid"))) errors.push(`${city}: 所有座標均無效`);
  const previousCount = previous.filter((route) => route.cityCode === city).reduce((sum, route) => sum + route.stopCount, 0);
  const nextCount = routes.reduce((sum, route) => sum + route.stopCount, 0);
  if (previousCount >= 100 && nextCount < previousCount * .7) errors.push(`${city}: 資料筆數較上次減少超過 30%`);
  return errors;
}
