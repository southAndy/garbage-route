// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { track } from "@vercel/analytics";
import TrackedLocationButton from "./tracked-location-button";

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
let intersect: (entries: Partial<IntersectionObserverEntry>[]) => void;
const disconnect = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

it("只在至少一半按鈕可見時記錄一次曝光，重複點擊保留次數", () => {
  const onClick = vi.fn();
  render(<TrackedLocationButton source="route_search" onClick={onClick}>定位</TrackedLocationButton>);
  expect(track).not.toHaveBeenCalled();
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 0.1 }]));
  expect(track).not.toHaveBeenCalled();
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 1 }]));
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 1 }]));
  expect(track).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(screen.getByRole("button"));
  expect(onClick).toHaveBeenCalledTimes(2);
  expect(vi.mocked(track).mock.calls).toEqual([
    ["location_button_viewed", { source: "route_search" }],
    ["location_button_clicked", { source: "route_search" }],
    ["location_button_clicked", { source: "route_search" }],
  ]);
});

it("點擊早於曝光回呼時補記曝光，且追蹤失敗不影響定位", () => {
  const onClick = vi.fn();
  vi.mocked(track).mockImplementation(() => { throw new Error("unavailable"); });
  render(<TrackedLocationButton source="map" onClick={onClick}>定位</TrackedLocationButton>);
  fireEvent.click(screen.getByRole("button"));
  expect(track).toHaveBeenNthCalledWith(1, "location_button_viewed", { source: "map" });
  expect(track).toHaveBeenNthCalledWith(2, "location_button_clicked", { source: "map" });
  expect(onClick).toHaveBeenCalledOnce();
});

it("停用按鈕不記錄點擊，卸載後停止觀察", () => {
  const view = render(<TrackedLocationButton source="district_search" disabled>定位</TrackedLocationButton>);
  fireEvent.click(screen.getByRole("button"));
  expect(track).not.toHaveBeenCalled();
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});
