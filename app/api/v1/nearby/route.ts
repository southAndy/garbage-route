import { NextRequest, NextResponse } from "next/server";
import { parseNearbyQuery } from "@/lib/nearby-search";
import { findNearby } from "@/lib/repository";

export const revalidate = 21600;

export function GET(request: NextRequest) {
  const query = parseNearbyQuery(request.nextUrl.searchParams);
  if (!query.ok) {
    return NextResponse.json({ error: { code: query.code, message: query.message } }, { status: 400 });
  }
  const data = findNearby(query.point, query.radius);
  return NextResponse.json({ data, meta: { total: data.routes.length } });
}
