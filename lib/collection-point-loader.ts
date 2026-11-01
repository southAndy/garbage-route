import { parseCollectionPoints, TAIPEI_COLLECTION_CSV } from "./collection-points";

export async function loadCollectionPoints() {
  try {
    const response = await fetch(TAIPEI_COLLECTION_CSV, {
      next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Collection data HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    let csv: string;
    try {
      csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      // The official CSV uses Big5. Response.text() always decodes as UTF-8,
      // regardless of Content-Type, so preserve the bytes before decoding.
      csv = new TextDecoder("big5", { fatal: true }).decode(bytes);
    }
    const points = parseCollectionPoints(csv);
    return { points, failed: false };
  } catch {
    // Never invent locations or present an unavailable dataset as zero collection points.
    return { points: [], failed: true };
  }
}
