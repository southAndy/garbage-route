import { parse } from "csv-parse/sync";

export const TAIPEI_COLLECTION_CSV = "https://data.taipei/api/dataset/1acf38f3-1509-4cb1-898a-9b1d4f31a3af/resource/0263f0ce-403a-45ed-a407-c69285b6cad2/download";
export const TAIPEI_COLLECTION_SOURCE = "https://data.taipei/dataset/detail?id=1acf38f3-1509-4cb1-898a-9b1d4f31a3af";
export const TAIPEI_COLLECTION_MAP = "https://www.dep-trash-can.gov.taipei/tcr/";
export const NEW_TAIPEI_COLLECTION_MAP = "https://crd-rubbish.epd.ntpc.gov.tw/dispPageBox/Ntpcepd/NtpMP.aspx?ddsPageID=MAP";

export interface CollectionPoint {
  id: string;
  district: string;
  name: string;
  address: string;
  phone: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
}

export function parseCollectionPoints(csv: string): CollectionPoint[] {
  let headers: string[] = [];
  const rows = parse(csv, {
    bom: true, trim: true, skip_empty_lines: true,
    columns: (names: string[]) => { headers = names.map((name) => name.trim()); return headers; },
  }) as Record<string, string>[];
  for (const field of ["行政區", "分隊", "地址", "備註", "緯度", "經度"]) {
    if (!headers.includes(field)) throw new Error(`Missing collection point column: ${field}`);
  }
  if (!rows.length || rows.length > 1000) throw new Error("Unexpected collection point count");
  return rows.map((row, index) => {
    const district = row["行政區"]?.trim();
    const address = row["地址"]?.trim();
    if (!district || !address) throw new Error("Collection point missing district or address");
    const lat = row["緯度"]?.trim() ? Number(row["緯度"]) : NaN;
    const lng = row["經度"]?.trim() ? Number(row["經度"]) : NaN;
    // Missing or misplaced coordinates must not send someone to the wrong destination.
    const valid = Number.isFinite(lat) && Number.isFinite(lng) && lat >= 24.9 && lat <= 25.3 && lng >= 121.4 && lng <= 121.7;
    return {
      id: `tpe-collection-${index}`, district, address,
      name: row["分隊"]?.trim() || `${district}收受點`,
      phone: row["電話"]?.trim() || "",
      notes: row["備註"]?.trim() || "官方資料未列收受時段與種類，請先查詢官方資訊或致電確認。",
      latitude: valid ? lat : null, longitude: valid ? lng : null,
    };
  });
}
