import { NextResponse } from "next/server";
import { z } from "zod";
import { findNearby } from "@/lib/repository";

const pointSchema = z.object({ lat: z.number().min(21.5).max(25.5), lng: z.number().min(119).max(122.5) });

/** Explicitly confirmed map points retain precision so card and map distances agree. */
export async function POST(request: Request) {
  const point = pointSchema.safeParse(await request.json().catch(() => null));
  const headers = { "Cache-Control": "no-store" };
  if (!point.success) return NextResponse.json({ error: "請提供有效的參考位置" }, { status: 400, headers });
  const data = findNearby(point.data);
  return NextResponse.json({ data }, { headers });
}
