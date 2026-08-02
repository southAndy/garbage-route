import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createSuspiciousCoordinateReport } from "../lib/coordinate-quality";
import type { ManualCoordinateFlag } from "../lib/coordinate-quality";
import type { GarbageRoute } from "../lib/types";
import coordinateFlagsData from "../data/coordinate-flags.json";

async function main() {
  const routesTarget = resolve(process.cwd(), "data/routes.json");
  const reportTarget = resolve(process.cwd(), "data/suspicious-coordinates.json");
  const routes = JSON.parse(await readFile(routesTarget, "utf8")) as GarbageRoute[];
  const coordinateFlags = coordinateFlagsData as { schemaVersion: 1; flags: ManualCoordinateFlag[] };
  const report = createSuspiciousCoordinateReport(routes, undefined, coordinateFlags.flags);
  await writeFile(reportTarget, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    `座標掃描完成：${report.summary.findings} 項可疑資料`
    + `（單點 ${report.summary.isolatedStops}、長區段 ${report.summary.longSegments}）`,
  );
  console.log(`清單：${reportTarget}`);
}

main().catch((error) => {
  console.error("座標掃描失敗：", error);
  process.exitCode = 1;
});
