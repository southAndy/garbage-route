import { parseCollectionPoints, TAIPEI_COLLECTION_CSV } from "./collection-points";

export async function loadCollectionPoints() {
  try {
    const response = await fetch(TAIPEI_COLLECTION_CSV, {
      next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Collection data HTTP ${response.status}`);
    const points = parseCollectionPoints(await response.text());
    return { points, failed: false };
  } catch {
    // Never invent locations or present an unavailable dataset as zero collection points.
    return { points: [], failed: true };
  }
}
