import { expect, it } from "vitest";
import { readAdsMode } from "./ads";

it("只接受 placeholder 與 measure，其他值一律關閉", () => {
  expect(readAdsMode("placeholder")).toBe("placeholder");
  expect(readAdsMode(" Placeholder ")).toBe("placeholder");
  expect(readAdsMode("measure")).toBe("measure");
  expect(readAdsMode("live")).toBe("off");
  expect(readAdsMode("")).toBe("off");
  expect(readAdsMode(undefined)).toBe("off");
});
