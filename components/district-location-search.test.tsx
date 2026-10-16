// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DistrictLocationSearch from "./district-location-search";
import { clearLocationSession, getLocationSession } from "../lib/user-location";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => { cleanup(); clearLocationSession(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("在行政區頁提供定位，傳送約略座標並保留位置供路線地圖使用", async () => {
  let success: PositionCallback;
  const locate = vi.fn((callback: PositionCallback) => { success = callback; });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: locate }, userAgent: "test" });
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {
    resolved: { city: "TPE", district: "士林區", districtSlug: "shilin" }, radius: 500, expanded: false, routes: [],
  } }) });
  vi.stubGlobal("fetch", fetcher);
  render(<DistrictLocationSearch city="TPE" districtSlug="shilin" />);
  expect(locate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /使用目前位置查附近路線/ }));
  await act(async () => { success({ coords: { latitude: 25.123456, longitude: 121.523456, accuracy: 30 } } as GeolocationPosition); });
  expect(fetcher).toHaveBeenCalledWith("/api/v1/nearby?lat=25.123&lng=121.523");
  expect(screen.getByText(/位置約在臺北市士林區/)).toBeTruthy();
  expect(screen.getByText(/附近沒有站點/)).toBeTruthy();
  expect(getLocationSession()?.position.lat).toBe(25.123456);
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "清除定位" }));
  expect(getLocationSession()).toBeNull();
});

it("瀏覽器不支援定位時顯示提示", () => {
  vi.stubGlobal("navigator", { userAgent: "test" });
  render(<DistrictLocationSearch city="TPE" districtSlug="shilin" />);
  fireEvent.click(screen.getByRole("button", { name: /使用目前位置查附近路線/ }));
  expect(screen.getByRole("status").textContent).toContain("此瀏覽器不支援定位");
});

it("從大同區定位到永和時切換行政區，且不在大同區渲染永和結果", async () => {
  let success: PositionCallback;
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (callback: PositionCallback) => { success = callback; } }, userAgent: "test" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {
    resolved: { city: "NTP", district: "永和區", districtSlug: "yonghe" }, radius: 500, expanded: false, routes: [],
  } }) }));
  const view = render(<DistrictLocationSearch city="TPE" districtSlug="datong" />);
  fireEvent.click(screen.getByRole("button", { name: /使用目前位置查附近路線/ }));
  await act(async () => { success({ coords: { latitude: 25.01, longitude: 121.51, accuracy: 30 } } as GeolocationPosition); });
  expect(push).toHaveBeenCalledWith("/routes/ntp/yonghe");
  expect(screen.queryByText(/位置約在新北市永和區/)).toBeNull();
  view.rerender(<DistrictLocationSearch city="NTP" districtSlug="yonghe" />);
  expect(screen.getByText(/位置約在新北市永和區/)).toBeTruthy();
  view.rerender(<DistrictLocationSearch city="TPE" districtSlug="datong" />);
  expect(screen.queryByText(/位置約在新北市永和區/)).toBeNull();
  expect(push).toHaveBeenCalledTimes(1);
});
