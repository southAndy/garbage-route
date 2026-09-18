import { resolve } from "node:path";
import { syncData } from "../lib/data-sync";
import type { ManualCoordinateFlag } from "../lib/coordinate-quality";
import coordinateFlagsData from "../data/coordinate-flags.json";

syncData({
  directory: resolve(process.cwd(), "data"),
  taipeiUrl: process.env.TAIPEI_GARBAGE_DATA_URL || "https://data.taipei/api/dataset/6bb3304b-4f46-4bb0-8cd1-60c66dcd1cae/resource/a6e90031-7ec4-4089-afb5-361a4efe7202/download",
  newTaipeiUrl: process.env.NEW_TAIPEI_GARBAGE_DATA_URL || "https://data.ntpc.gov.tw/api/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8/csv/file",
  coordinateFlags: coordinateFlagsData.flags as ManualCoordinateFlag[],
}).catch((error) => {
  console.error("同步失敗，未觸發部署；請檢查來源與資料快照：", error);
  process.exitCode = 1;
});
