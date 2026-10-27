// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { track } from "@vercel/analytics";
import AdSlot from "./ad-slot";

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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("未設定模式時不渲染任何東西", () => {
  vi.stubEnv("NEXT_PUBLIC_ADS_MODE", "");
  const { container } = render(<AdSlot slot="route_stops" />);
  expect(container.innerHTML).toBe("");
  expect(track).not.toHaveBeenCalled();
});

it("placeholder 模式畫出固定尺寸框，至少一半可見時記錄一次曝光", () => {
  vi.stubEnv("NEXT_PUBLIC_ADS_MODE", "placeholder");
  const view = render(<AdSlot slot="district_list" />);
  const frame = screen.getByRole("complementary", { name: "廣告" }).querySelector(".ad-slot-frame");
  expect(frame?.getAttribute("data-slot")).toBe("district_list");
  expect(screen.getByText("廣告位預覽")).toBeTruthy();
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 0.2 }]));
  expect(track).not.toHaveBeenCalled();
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 0.8 }]));
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 1 }]));
  expect(vi.mocked(track).mock.calls).toEqual([["ad_slot_viewed", { slot: "district_list", mode: "placeholder" }]]);
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});

it("measure 模式只留看不見的觀測點，進入畫面就記錄一次曝光", () => {
  vi.stubEnv("NEXT_PUBLIC_ADS_MODE", "measure");
  const { container } = render(<AdSlot slot="route_stops" />);
  expect(container.textContent).toBe("");
  expect(container.querySelector(".ad-slot-sentinel")?.getAttribute("data-slot")).toBe("route_stops");
  act(() => intersect([{ isIntersecting: false, intersectionRatio: 0 }]));
  expect(track).not.toHaveBeenCalled();
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 1 }]));
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 1 }]));
  expect(vi.mocked(track).mock.calls).toEqual([["ad_slot_viewed", { slot: "route_stops", mode: "measure" }]]);
});

it("追蹤失敗不影響渲染", () => {
  vi.stubEnv("NEXT_PUBLIC_ADS_MODE", "placeholder");
  vi.mocked(track).mockImplementation(() => { throw new Error("unavailable"); });
  render(<AdSlot slot="route_stops" />);
  expect(() => act(() => intersect([{ isIntersecting: true, intersectionRatio: 1 }]))).not.toThrow();
  expect(screen.getByText("廣告位預覽")).toBeTruthy();
});
