// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CollectionPointFinder from "./collection-point-finder";
import type { CollectionPoint } from "../lib/collection-points";

const points: CollectionPoint[] = [
  { id: "a", name: "較遠點", district: "中正區", address: "測試地址甲", notes: "週一收受", phone: "", latitude: 25.1, longitude: 121.6 },
  { id: "b", name: "較近點", district: "信義區", address: "測試地址乙", notes: "週二收受", phone: "", latitude: 25.03, longitude: 121.52 },
];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("定位僅在點擊後執行，依距離排序並可篩選行政區", () => {
  let resolve: PositionCallback;
  const locate = vi.fn((callback: PositionCallback) => { resolve = callback; });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: locate }, userAgent: "test" });
  render(<CollectionPointFinder points={points} failed={false} />);
  expect(locate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "依目前位置排序" }));
  act(() => resolve({ coords: { latitude: 25.03, longitude: 121.52 } } as GeolocationPosition));
  expect(screen.getAllByRole("heading", { level: 2 })[0].textContent).toBe("較近點");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "中正區" } });
  expect(screen.queryByText("較近點")).toBeNull();
  expect(screen.getByText("較遠點")).toBeTruthy();
});
it("定位拒絕後仍可手動查詢，導航不包含使用者起點", () => {
  vi.stubGlobal("navigator", { userAgent: "test", geolocation: { getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) => fail({ code: 1 } as GeolocationPositionError) } });
  render(<CollectionPointFinder points={points} failed={false} />);
  fireEvent.click(screen.getByRole("button", { name: "依目前位置排序" }));
  expect(screen.getByRole("status").textContent).toContain("封鎖定位");
  expect(screen.getAllByRole("link", { name: /前往導航/ })[0].getAttribute("href")).not.toContain("origin=");
});
it("台北載入失敗保留官方入口，新北不冒充已有站點列表", () => {
  render(<CollectionPointFinder points={[]} failed />);
  expect(screen.getByText("暫時無法載入臺北收受點")).toBeTruthy();
  expect(screen.getByRole("link", { name: /臺北官方/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "新北市" }));
  expect(screen.getByRole("link", { name: /新北官方/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "依目前位置排序" })).toBeNull();
});
