import { createHash } from "node:crypto";
import type { CoordinateStatus } from "./types";

export interface NormalizedTime {
  displayTime: string;
  serviceDayOffset: number;
  sortMinutes: number;
}

export function normalizeTime(input: unknown): NormalizedTime | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().replace(/[：]/g, ":");
  if (!raw) return null;
  const digits = raw.replace(":", "");
  if (!/^\d{3,4}$/.test(digits)) return null;
  const padded = digits.padStart(4, "0");
  const hours = Number(padded.slice(0, 2));
  const minutes = Number(padded.slice(2));
  if (hours > 47 || minutes > 59) return null;
  const serviceDayOffset = Math.floor(hours / 24);
  const displayHours = hours % 24;
  return {
    displayTime: `${String(displayHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    serviceDayOffset,
    sortMinutes: hours * 60 + minutes,
  };
}

export function normalizeCoordinate(
  rawLongitude: unknown,
  rawLatitude: unknown,
): { longitude: number | null; latitude: number | null; status: CoordinateStatus } {
  const lonText = String(rawLongitude ?? "").trim();
  const latText = String(rawLatitude ?? "").trim();
  if (!lonText || !latText) return { longitude: null, latitude: null, status: "missing" };
  let longitude = Number(lonText);
  let latitude = Number(latText);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return { longitude: null, latitude: null, status: "invalid" };
  }
  if (longitude >= 21 && longitude <= 26 && latitude >= 119 && latitude <= 123) {
    [longitude, latitude] = [latitude, longitude];
  }
  if (longitude < 119 || longitude > 123 || latitude < 21 || latitude > 26) {
    return { longitude: null, latitude: null, status: "invalid" };
  }
  return { longitude, latitude, status: "valid" };
}

export function stableRouteId(parts: string[], prefix: string) {
  const hash = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 10);
  return `${prefix.toLowerCase()}-${hash}`;
}

export function districtSlug(city: "TPE" | "NTP", district: string) {
  const known: Record<string, string> = {
    士林區: "shilin", 北投區: "beitou", 中山區: "zhongshan", 大安區: "daan",
    信義區: "xinyi", 松山區: "songshan", 內湖區: "neihu", 南港區: "nangang",
    萬華區: "wanhua", 中正區: "zhongzheng", 大同區: "datong", 文山區: "wenshan",
    新店區: "xindian", 板橋區: "banqiao", 新莊區: "xinzhuang", 三重區: "sanchong",
    中和區: "zhonghe", 永和區: "yonghe", 土城區: "tucheng", 蘆洲區: "luzhou",
    汐止區: "xizhi", 淡水區: "tamsui", 樹林區: "shulin", 五股區: "wugu",
    八里區: "bali", 三峽區: "sanxia", 三芝區: "sanzhi", 石門區: "shimen",
    石碇區: "shiding", 平溪區: "pingxi", 坪林區: "pinglin", 林口區: "linkou",
    金山區: "jinshan", 泰山區: "taishan", 烏來區: "wulai", 貢寮區: "gongliao",
    深坑區: "shenkeng", 雙溪區: "shuangxi", 瑞芳區: "ruifang", 萬里區: "wanli",
    鶯歌區: "yingge",
  };
  return known[district] ?? `${city.toLowerCase()}-${stableRouteId([district], "district")}`;
}
