// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapLocationControl from "./map-location-control";
import { clearLocationSession, getLocationSession } from "../lib/user-location";
import type { GarbageRoute } from "../lib/types";

const route = { stops: [
  { id: "trusted", coordinateStatus: "valid", latitude: 25.001, longitude: 121.5 },
  { id: "suspect", coordinateStatus: "valid", latitude: 25, longitude: 121.5 },
], coordinateWarnings: [{ affectedStopIds: ["suspect"] }] } as GarbageRoute;
let success: PositionCallback;
let failure: PositionErrorCallback;
const getCurrentPosition = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => { success = ok; failure = fail; });

beforeEach(() => {
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition }, userAgent: "test" });
});
afterEach(() => { cleanup(); clearLocationSession(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("map location control", () => {
  it("只在點擊後定位，保留精確座標並忽略可疑站點計算距離", () => {
    render(<MapLocationControl route={route} />);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /定位我的位置/ }));
    expect(screen.getByRole("button", { name: "定位中…" }).hasAttribute("disabled")).toBe(true);
    act(() => success({ coords: { latitude: 25, longitude: 121.5, accuracy: 50 } } as GeolocationPosition));
    expect(getLocationSession()?.position.lat).toBe(25);
    expect(getLocationSession()?.nearby).toBeNull();
    expect(screen.getByText(/最近站點約 111 公尺/)).toBeTruthy();
    expect(screen.getByText(/定位誤差約 50 公尺/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "清除定位" }));
    expect(getLocationSession()).toBeNull();
  });

  it.each([1, 2, 3])("定位錯誤 %s 顯示提示並允許重試", (code) => {
    render(<MapLocationControl route={route} />);
    fireEvent.click(screen.getByRole("button", { name: /定位我的位置/ }));
    act(() => failure({ code } as GeolocationPositionError));
    expect(screen.getByRole("status").textContent).not.toBe("");
    fireEvent.click(screen.getByRole("button", { name: /定位我的位置/ }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it("離開頁面後忽略尚未完成的定位", () => {
    const view = render(<MapLocationControl route={route} />);
    fireEvent.click(screen.getByRole("button", { name: /定位我的位置/ }));
    view.unmount();
    act(() => success({ coords: { latitude: 25, longitude: 121.5, accuracy: 50 } } as GeolocationPosition));
    expect(getLocationSession()).toBeNull();
  });
});
