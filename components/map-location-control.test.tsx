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
  it("共用右側圖示回到位置並切換面板，Escape 收合後焦點回到圖示", () => {
    const onFocusPosition = vi.fn();
    render(<MapLocationControl route={route} onFocusPosition={onFocusPosition} />);
    fireEvent.click(screen.getByRole("button", { name: "定位我的位置" }));
    act(() => success({ coords: { latitude: 25, longitude: 121.5, accuracy: 50 } } as GeolocationPosition));
    const icon = screen.getByRole("button", { name: "回到我的位置" });
    fireEvent.click(icon);
    expect(onFocusPosition).toHaveBeenCalledTimes(1);
    expect(icon.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(icon);
    expect(screen.queryByRole("button", { name: "更新我的位置" })).toBeNull();
    fireEvent.click(icon);
    fireEvent.keyDown(screen.getByRole("button", { name: "更新我的位置" }), { key: "Escape" });
    expect(icon.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(icon);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("只在點擊後定位，保留精確座標並忽略可疑站點計算距離", () => {
    render(<MapLocationControl route={route} />);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /定位我的位置/ }));
    expect(screen.getByRole("button", { name: "定位中…" }).hasAttribute("disabled")).toBe(true);
    act(() => success({ coords: { latitude: 25, longitude: 121.5, accuracy: 50 } } as GeolocationPosition));
    expect(getLocationSession()?.position.lat).toBe(25);
    expect(getLocationSession()?.nearby).toBeNull();
    expect(screen.queryByRole("button", { name: "更新我的位置" })).toBeNull();
    expect(screen.queryByText(/最近站點約/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "回到我的位置" }));
    expect(screen.getByText(/最近站點約 111 公尺/)).toBeTruthy();
    expect(screen.getByText(/定位誤差約 50 公尺/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "清除定位" }));
    expect(getLocationSession()).toBeNull();
  });

  it("更新失敗時展開提示並保留上次位置，可收合後重新展開", () => {
    render(<MapLocationControl route={route} />);
    fireEvent.click(screen.getByRole("button", { name: /定位我的位置/ }));
    act(() => success({ coords: { latitude: 25, longitude: 121.5, accuracy: 50 } } as GeolocationPosition));
    fireEvent.click(screen.getByRole("button", { name: "回到我的位置" }));
    fireEvent.click(screen.getByRole("button", { name: "更新我的位置" }));
    fireEvent.click(screen.getByRole("button", { name: "收合" }));
    act(() => failure({ code: 3 } as GeolocationPositionError));
    expect(screen.getByRole("status").textContent).toContain("定位逾時");
    expect(screen.getByText("地圖仍顯示上次成功定位的位置。")).toBeTruthy();
    expect(getLocationSession()?.position.lat).toBe(25);
    fireEvent.click(screen.getByRole("button", { name: "收合" }));
    expect(screen.queryByText(/定位逾時/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "回到我的位置" }));
    expect(screen.getByText(/定位逾時/)).toBeTruthy();
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
