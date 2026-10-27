import { afterEach, expect, it, vi } from "vitest";
import { track } from "@vercel/analytics";
import { trackMapPicker } from "./map-picker-analytics";
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
afterEach(() => vi.mocked(track).mockReset());

it("only sends event name and allowed status, even when input has extra data", () => {
  const event = { name: "map_picker_result" as const, status: "success" as const, query: "私人地址", lat: 25, lng: 121.5 };
  trackMapPicker(event);
  expect(track).toHaveBeenCalledWith("map_picker_result", { status: "success" });
  trackMapPicker({ name: "map_picker_opened" });
  expect(track).toHaveBeenLastCalledWith("map_picker_opened", {});
});

it("never interrupts the UI when analytics throws", () => {
  vi.mocked(track).mockImplementation(() => { throw new Error("blocked"); });
  expect(() => trackMapPicker({ name: "map_picker_confirm_clicked" })).not.toThrow();
});
