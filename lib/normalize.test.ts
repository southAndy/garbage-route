import { describe, expect, it } from "vitest";
import { normalizeCoordinate, normalizeTime } from "./normalize";

describe("normalizeTime", () => {
  it.each([["1630","16:30",0,990],["19:05","19:05",0,1145],["2411","00:11",1,1451]])("正規化 %s", (input, displayTime, serviceDayOffset, sortMinutes) => {
    expect(normalizeTime(input)).toEqual({ displayTime, serviceDayOffset, sortMinutes });
  });
  it.each(["", "2460", "abc", "4800"])("拒絕無效時間 %s", (value) => expect(normalizeTime(value)).toBeNull());
});

describe("normalizeCoordinate", () => {
  it("接受 WGS84", () => expect(normalizeCoordinate("121.53","25.11")).toEqual({ longitude:121.53, latitude:25.11, status:"valid" }));
  it("修正經緯度互換", () => expect(normalizeCoordinate("25.11","121.53")).toEqual({ longitude:121.53, latitude:25.11, status:"valid" }));
  it("區分缺漏與無效", () => {
    expect(normalizeCoordinate("","").status).toBe("missing");
    expect(normalizeCoordinate("300000","2770000").status).toBe("invalid");
  });
});
