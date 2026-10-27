import { describe, expect, it } from "vitest";
import { findRoutes } from "./repository";

describe("reported address search", () => {
  it("finds Jingxin Street stops for the reported question, without inventing a clinic stop", () => {
    const results = findRoutes("NTP", "中和區", "我家是住在景新街293號建成中醫.請問垃圾車什麼時候到站\n");
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.district).toBe("中和區");
      expect(result.matches).toMatchObject({ query: "景新街", broadened: true });
      expect(result.matches!.stops.length).toBeGreaterThan(0);
      expect(result.matches!.stops.every((stop) => stop.name.includes("景新街"))).toBe(true);
    }
  });
});
