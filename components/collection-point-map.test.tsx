// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CollectionPointMap from "./collection-point-map";
import type { CollectionPoint } from "../lib/collection-points";

const { instances } = vi.hoisted(() => ({ instances: [] as Array<{
  host: HTMLElement; load?: () => void; remove: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>; easeTo: ReturnType<typeof vi.fn>;
}> }));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(), NavigationControl: class {}, AttributionControl: class {},
  LngLatBounds: class { extend() { return this; } },
  Map: class {
    host: HTMLElement;
    load?: () => void;
    remove = vi.fn(); fitBounds = vi.fn(); easeTo = vi.fn();
    constructor({ container }: { container: HTMLElement }) { this.host = container; instances.push(this); }
    addControl() {} resize() {} getZoom() { return 12; }
    on(_event: string, callback: () => void) { this.load = callback; }
  },
  Marker: class {
    element: HTMLElement;
    constructor({ element }: { element: HTMLElement }) { this.element = element; }
    setLngLat() { return this; }
    addTo(map: { host: HTMLElement }) { map.host.appendChild(this.element); return this; }
    getElement() { return this.element; }
    remove() { this.element.remove(); }
  },
}));
const points: CollectionPoint[] = [
  { id: "a", name: "松山點", district: "松山區", address: "甲", notes: "週三收受", phone: "", latitude: 25.05, longitude: 121.56 },
  { id: "b", name: "缺座標點", district: "松山區", address: "乙", notes: "週四收受", phone: "", latitude: null, longitude: null },
];
beforeEach(() => {
  instances.length = 0;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 8, sources: {}, layers: [] }) }));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("只標示可靠座標，標記可點選並跟隨列表選取，卸載時釋放地圖", async () => {
  const select = vi.fn();
  const view = render(<CollectionPointMap points={points} selectedId={null} position={null} onSelect={select} />);
  await waitFor(() => expect(instances).toHaveLength(1));
  act(() => instances[0].load?.());
  expect(screen.queryByRole("button", { name: "在地圖選取：缺座標點" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "在地圖選取：松山點" }));
  expect(select).toHaveBeenCalledWith("a");
  view.rerender(<CollectionPointMap points={points} selectedId="a" position={null} onSelect={select} />);
  expect(screen.getByRole("button", { name: "在地圖選取：松山點" }).getAttribute("aria-pressed")).toBe("true");
  expect(instances[0].easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [121.56, 25.05] }));
  view.rerender(<CollectionPointMap points={[]} selectedId={null} position={null} onSelect={select} />);
  expect(screen.queryByRole("button", { name: "在地圖選取：松山點" })).toBeNull();
  view.unmount();
  expect(instances[0].remove).toHaveBeenCalledOnce();
});
it("地圖初始化失敗仍提供重試，避免空白畫面", async () => {
  vi.stubGlobal("ResizeObserver", class { constructor() { throw new Error("unavailable"); } });
  render(<CollectionPointMap points={points} selectedId={null} position={null} onSelect={() => {}} />);
  expect(await screen.findByText("暫時無法顯示地圖")).toBeTruthy();
  expect(screen.getByRole("button", { name: "重新載入地圖" })).toBeTruthy();
});

it("底圖載入較慢時先顯示備援，恢復後移除錯誤提示", async () => {
  vi.useFakeTimers();
  render(<CollectionPointMap points={points} selectedId={null} position={null} onSelect={() => {}} />);
  await act(async () => {});
  expect(instances).toHaveLength(1);
  act(() => vi.advanceTimersByTime(15_000));
  expect(screen.getByText("暫時無法顯示地圖")).toBeTruthy();
  act(() => instances[0].load?.());
  expect(screen.queryByText("暫時無法顯示地圖")).toBeNull();
  expect(screen.getByRole("button", { name: "在地圖選取：松山點" })).toBeTruthy();
});
