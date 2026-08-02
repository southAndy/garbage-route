import { describe, expect, it } from "vitest";
import { makeMapStyleCompatible } from "./map-style";

describe("makeMapStyleCompatible", () => {
  it("為數值 filter 的 null 屬性加入安全 fallback", () => {
    const style = { layers: [{ filter: ["all", [">=", ["get", "rank"], 3], ["<", ["get", "rank"], 20]] }] };
    expect(makeMapStyleCompatible(style).layers[0].filter).toEqual([
      "all",
      [">=", ["number", ["get", "rank"], -1_000_000_000], 3],
      ["<", ["number", ["get", "rank"], 1_000_000_000], 20],
    ]);
  });

  it("不改變文字比較 filter", () => {
    const style = { layers: [{ filter: ["==", ["get", "class"], "road"] }] };
    expect(makeMapStyleCompatible(style).layers[0].filter).toEqual(["==", ["get", "class"], "road"]);
  });
});
