import { describe, expect, it } from "vitest";
import { parsePlaces } from "./place-search";

const place = (properties: object, coordinates = [121.51, 24.99]) => ({ geometry: { type: "Point", coordinates }, properties });
describe("place candidates", () => {
  it("distinguishes a street centroid from a house or named POI", () => {
    const results = parsePlaces({ features: [place({ name: "景新街", osm_key: "highway" }), place({ street: "景新街", housenumber: "293" }), place({ name: "建成中醫", osm_key: "amenity" })] });
    expect(results.map((item) => item.approximate)).toEqual([true, false, false]);
    expect(results[1].label).toContain("293號");
  });
  it("discards malformed, unnamed and out-of-region results and deduplicates", () => {
    const valid = place({ name: "景新街" });
    expect(parsePlaces({ features: [null, {}, place({ name: "London" }, [-0.1, 51]), place({}), valid, valid] })).toHaveLength(1);
    expect(() => parsePlaces({ error: "bad gateway" })).toThrow();
  });
});
