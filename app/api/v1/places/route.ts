import { NextResponse } from "next/server";
import { z } from "zod";
import { parsePlaces, type PlaceCandidate } from "@/lib/place-search";

const bodySchema = z.object({ query: z.string().trim().min(2).max(160), area: z.string().trim().max(30).default("") });
// Bounded, short-lived cache; addresses are not persisted or logged.
const cache = new Map<string, { until: number; data: PlaceCandidate[] }>();
let nextRequest = 0;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "請輸入 2 至 160 字的地址或地點名稱。" }, 400);
  const { query, area } = parsed.data;
  const text = query.includes(area) ? query : `${area} ${query}`.trim();
  const cached = cache.get(text);
  if (cached && cached.until > Date.now()) return reply({ data: cached.data });
  if (Date.now() < nextRequest) return reply({ error: "查詢較頻繁，請稍後再試，或直接在地圖選點。" }, 429);
  nextRequest = Date.now() + 1000;
  try {
    const url = new URL(process.env.PHOTON_API_URL || "https://photon.komoot.io/api/");
    url.search = new URLSearchParams({ q: text, limit: "5", bbox: "121.25,24.65,122.05,25.35" }).toString();
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Place search unavailable");
    const data = parsePlaces(await response.json());
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(text, { until: Date.now() + 5 * 60_000, data });
    return reply({ data });
  } catch {
    return reply({ error: "地址查詢暫時無法使用，請稍後再試，或直接在地圖選點。" }, 503);
  }
}
