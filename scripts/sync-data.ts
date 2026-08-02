import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeNewTaipei, normalizeTaipei, qualityCheck } from "../lib/etl";
import { createSuspiciousCoordinateReport } from "../lib/coordinate-quality";
import type { GarbageRoute } from "../lib/types";

const TPE_URL = process.env.TAIPEI_GARBAGE_DATA_URL || "https://data.taipei/api/dataset/6bb3304b-4f46-4bb0-8cd1-60c66dcd1cae/resource/a6e90031-7ec4-4089-afb5-361a4efe7202/download";
const NTP_URL = process.env.NEW_TAIPEI_GARBAGE_DATA_URL || "https://data.ntpc.gov.tw/api/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8/csv/file";
const target = resolve(process.cwd(), "data/routes.json");
const manifestTarget = resolve(process.cwd(), "data/manifest.json");
const suspiciousCoordinatesTarget = resolve(process.cwd(), "data/suspicious-coordinates.json");
const SCHEMA_VERSION = 1;

interface SnapshotManifest {
  schemaVersion: number;
  generatedAt: string;
  totals: { routes: number; stops: number; districts: number };
  sources: Record<"TPE" | "NTP", {
    url: string;
    checksum: string;
    etag: string | null;
    lastModified: string | null;
    routes: number;
    stops: number;
    districts: number;
  }>;
}

async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { "user-agent": "twin-city-garbage-routes/0.1" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  const text = await response.text();
  return {
    text,
    checksum: createHash("sha256").update(text).digest("hex"),
    etag: response.headers.get("etag"),
    updatedAt: response.headers.get("last-modified"),
  };
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestTarget, "utf8")) as SnapshotManifest;
  } catch {
    return null;
  }
}

async function main() {
  const previous = JSON.parse(await readFile(target, "utf8")) as GarbageRoute[];
  const syncedAt = new Date().toISOString();
  const [tpeFile, ntpFile] = await Promise.all([download(TPE_URL), download(NTP_URL)]);
  const previousManifest = await readManifest();
  if (
    previousManifest?.schemaVersion === SCHEMA_VERSION &&
    previousManifest.sources.TPE.checksum === tpeFile.checksum &&
    previousManifest.sources.NTP.checksum === ntpFile.checksum
  ) {
    console.log(`來源資料未變更，沿用 ${previousManifest.generatedAt} 的 JSON 快照`);
    return;
  }
  const options = { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true } as const;
  const tpeRows = parse(tpeFile.text, options) as Record<string, string>[];
  const ntpRows = parse(ntpFile.text, options) as Record<string, string>[];
  const tpe = normalizeTaipei(tpeRows, { name:"臺北市垃圾車點位路線資訊", url:"https://data.taipei/dataset/detail?id=6bb3304b-4f46-4bb0-8cd1-60c66dcd1cae", sourceUpdatedAt:tpeFile.updatedAt, syncedAt });
  const ntp = normalizeNewTaipei(ntpRows, { name:"新北市垃圾車路線", url:"https://data.ntpc.gov.tw/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8", sourceUpdatedAt:ntpFile.updatedAt, syncedAt });
  const errors = [...qualityCheck("TPE", tpe, previous), ...qualityCheck("NTP", ntp, previous)];
  if (errors.length) throw new Error(`品質檢查未通過：\n${errors.join("\n")}`);
  const temporary = `${target}.tmp`;
  const manifestTemporary = `${manifestTarget}.tmp`;
  const suspiciousCoordinatesTemporary = `${suspiciousCoordinatesTarget}.tmp`;
  const allRoutes = [...tpe, ...ntp];
  const sourceStats = (routes: GarbageRoute[]) => ({
    routes: routes.length,
    stops: routes.reduce((sum, route) => sum + route.stopCount, 0),
    districts: new Set(routes.map((route) => route.district)).size,
  });
  const tpeStats = sourceStats(tpe);
  const ntpStats = sourceStats(ntp);
  const manifest: SnapshotManifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: syncedAt,
    totals: {
      routes: allRoutes.length,
      stops: tpeStats.stops + ntpStats.stops,
      districts: tpeStats.districts + ntpStats.districts,
    },
    sources: {
      TPE: { url: TPE_URL, checksum: tpeFile.checksum, etag: tpeFile.etag, lastModified: tpeFile.updatedAt, ...tpeStats },
      NTP: { url: NTP_URL, checksum: ntpFile.checksum, etag: ntpFile.etag, lastModified: ntpFile.updatedAt, ...ntpStats },
    },
  };
  await writeFile(temporary, `${JSON.stringify(allRoutes)}\n`, "utf8");
  await writeFile(manifestTemporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(suspiciousCoordinatesTemporary, `${JSON.stringify(createSuspiciousCoordinateReport(allRoutes, syncedAt), null, 2)}\n`, "utf8");
  await rename(temporary, target);
  await rename(manifestTemporary, manifestTarget);
  await rename(suspiciousCoordinatesTemporary, suspiciousCoordinatesTarget);
  console.log(`同步完成：臺北 ${tpe.length} 條、新北 ${ntp.length} 條，共 ${tpeRows.length + ntpRows.length} 站`);
}

main().catch((error) => { console.error("同步失敗，保留最後成功資料：", error); process.exitCode = 1; });
