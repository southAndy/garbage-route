import { expect, it } from "vitest";
import { createLocationIndex, suggestLocations } from "./location-suggestions";
import type { GarbageRoute } from "./types";

const fixture = (district: string, names: string[], cityCode = "NTP") => ({ cityCode, district, stops: names.map((name) => ({ name, address: name })) }) as GarbageRoute;
const index = createLocationIndex([
  fixture("中和區", ["新北市中和區景新路293號", "景新路295巷", "建成中醫旁"]),
  fixture("板橋區", ["景新路12號"]),
  fixture("中正區", ["台北市中正區中華路一段3號"], "TPE"),
]);
it("groups the same street by district and deduplicates stops", () => {
  const matches = suggestLocations(index, "景新路");
  expect(matches).toHaveLength(2);
  expect(matches.map((item) => item.district).sort()).toEqual(["中和區", "板橋區"].sort());
  expect(matches.every((item) => item.name === "景新路")).toBe(true);
});
it("respects explicit districts and preserves house numbers for route matching", () => {
  expect(suggestLocations(index, "新北市中和區景新路２９３號")).toEqual([
    { city: "NTP", district: "中和區", name: "景新路", query: "新北市中和區景新路２９３號" },
  ]);
});
it("supports partial roads, city spelling and named stops without inventing places", () => {
  expect(suggestLocations(index, "景新")).toHaveLength(2);
  expect(suggestLocations(index, "臺北市中正區中華路")[0].name).toBe("中華路一段");
  expect(suggestLocations(index, "建成")[0].name).toBe("建成中醫旁");
  expect(suggestLocations(index, "不存在路")).toEqual([]);
  expect(suggestLocations(index, " ")).toEqual([]);
});

it("matches district shorthand with or without spaces", () => {
  const local = createLocationIndex([fixture("永和區", ["文化路12號"]), fixture("板橋區", ["文化路一段8號"])]);
  for (const query of ["永和文化", "永和 文化", "永和區文化", "新北永和文化", "永和文化路"]) {
    expect(suggestLocations(local, query)).toEqual([{ city: "NTP", district: "永和區", name: "文化路", query: query.endsWith("文化路") ? query : "文化路" }]);
  }
});
