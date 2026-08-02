import { NextRequest, NextResponse } from "next/server";
import { getDistricts } from "@/lib/repository";
import type { CityCode } from "@/lib/types";

export const revalidate = 86400;

export function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.toUpperCase();
  if (city !== "TPE" && city !== "NTP") {
    return NextResponse.json(
      { error: { code: "INVALID_CITY", message: "請指定有效的城市" } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data: getDistricts(city as CityCode) });
}
