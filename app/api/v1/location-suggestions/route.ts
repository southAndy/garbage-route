import { NextResponse } from "next/server";
import { findLocationSuggestions } from "@/lib/repository";
import { z } from "zod";
export async function POST(request: Request) {
  const body = z.object({ query: z.string().trim().min(1).max(160) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "請輸入 1 至 160 字的關鍵字" }, { status: 400 });
  return NextResponse.json({ data: findLocationSuggestions(body.data.query) }, { headers: { "Cache-Control": "no-store" } });
}
