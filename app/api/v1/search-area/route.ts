import { NextResponse } from "next/server";
import { z } from "zod";
import { findSearchArea, getDistricts } from "@/lib/repository";

const schema = z.object({ city: z.enum(["TPE", "NTP"]), district: z.string().trim().max(20), query: z.string().trim().min(2).max(160) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const headers = { "Cache-Control": "no-store" };
  if (!parsed.success) return NextResponse.json({ error: "請輸入至少兩個字。" }, { status: 400, headers });
  const { city, district, query } = parsed.data;
  if (district && !getDistricts(city).some((area) => area.name === district)) return NextResponse.json({ error: "找不到指定行政區。" }, { status: 400, headers });
  return NextResponse.json({ data: findSearchArea(city, district, query) }, { headers });
}
