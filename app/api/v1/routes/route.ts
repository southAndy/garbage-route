import { NextRequest, NextResponse } from "next/server";
import { findRoutes, getDistricts } from "@/lib/repository";
import type { CityCode } from "@/lib/types";

export const revalidate = 21600;

export function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.toUpperCase();
  const district = request.nextUrl.searchParams.get("district")?.trim();
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (city !== "TPE" && city !== "NTP") {
    return NextResponse.json({ error: { code: "INVALID_CITY", message: "請指定有效的城市" } }, { status: 400 });
  }
  if (!district || !getDistricts(city as CityCode).some((item) => item.name === district)) {
    return NextResponse.json({ error: { code: "INVALID_DISTRICT", message: "找不到指定行政區" } }, { status: 400 });
  }
  const data = findRoutes(city as CityCode, district, query);
  return NextResponse.json({ data, meta: { total: data.length } });
}
