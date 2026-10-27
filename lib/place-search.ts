import { z } from "zod";

export interface PlaceCandidate { label: string; lat: number; lng: number; approximate: boolean }
const feature = z.object({
  geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({ name: z.string().optional(), street: z.string().optional(), housenumber: z.string().optional(), district: z.string().optional(), city: z.string().optional(), county: z.string().optional(), state: z.string().optional(), osm_key: z.string().optional() }),
});

export function parsePlaces(input: unknown): PlaceCandidate[] {
  const envelope = z.object({ features: z.array(z.unknown()) }).parse(input);
  const results: PlaceCandidate[] = [];
  for (const raw of envelope.features) {
    const parsed = feature.safeParse(raw);
    if (!parsed.success) continue;
    const { properties: p, geometry: { coordinates: [lng, lat] } } = parsed.data;
    if (lng < 121.25 || lng > 122.05 || lat < 24.65 || lat > 25.35) continue;
    const label = [...new Set([p.state, p.county, p.city, p.district, p.street, p.housenumber ? `${p.housenumber}號` : null, p.name].filter(Boolean))].join(" ");
    if (!label || results.some((item) => item.label === label && item.lat === lat && item.lng === lng)) continue;
    results.push({ label, lat, lng, approximate: !p.housenumber && !["amenity", "shop", "tourism", "office", "building"].includes(p.osm_key ?? "") });
  }
  return results.slice(0, 5);
}
