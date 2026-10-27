// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LocationMethodSelect from "./location-method-select";
import { track } from "@vercel/analytics";
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.mocked(track).mockReset(); });

it("preserves legacy source and counts only device selection as a location click", () => {
  const onLocate = vi.fn();
  render(<LocationMethodSelect current={null} locating={false} unsupported={false} onMap={vi.fn()} onLocate={onLocate} />);
  const select = screen.getByRole("combobox");
  fireEvent.change(select, { target: { value: "map" } });
  expect(track).not.toHaveBeenCalledWith("location_button_clicked", expect.anything());
  fireEvent.change(select, { target: { value: "device" } });
  fireEvent.change(select, { target: { value: "device" } });
  const legacy = vi.mocked(track).mock.calls.filter(([event]) => event.startsWith("location_button_"));
  expect(legacy).toEqual([
    ["location_button_viewed", { source: "route_search" }],
    ["location_button_clicked", { source: "route_search" }],
    ["location_button_clicked", { source: "route_search" }],
  ]);
  expect(onLocate).toHaveBeenCalledTimes(2);
});

it("records exposure once at 50% visibility and disconnects the observer", () => {
  let notify!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { notify = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
  const { unmount } = render(<LocationMethodSelect current={null} locating={false} unsupported={false} onMap={vi.fn()} onLocate={vi.fn()} />);
  const emit = (ratio: number) => act(() => notify([{ isIntersecting: true, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver));
  emit(0.49);
  expect(track).not.toHaveBeenCalled();
  emit(0.5); emit(1);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "device" } });
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "location_button_viewed")).toHaveLength(1);
  expect(disconnect).toHaveBeenCalled();
  unmount();
  expect(disconnect).toHaveBeenCalledTimes(2);
});

it("continues the location flow if analytics fails", () => {
  vi.mocked(track).mockImplementation(() => { throw new Error("analytics blocked"); });
  const onLocate = vi.fn();
  render(<LocationMethodSelect current={null} locating={false} unsupported={false} onMap={vi.fn()} onLocate={onLocate} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "device" } });
  expect(onLocate).toHaveBeenCalledOnce();
});

it("does not request location until explicitly selected and permits choosing a method again", () => {
  const onMap = vi.fn(), onLocate = vi.fn();
  render(<LocationMethodSelect current={null} locating={false} unsupported={false} onMap={onMap} onLocate={onLocate} />);
  const select = screen.getByRole("combobox", { name: "選擇參考位置方式" });
  expect(onLocate).not.toHaveBeenCalled();
  fireEvent.change(select, { target: { value: "map" } });
  expect(onMap).toHaveBeenCalledOnce();
  expect(onLocate).not.toHaveBeenCalled();
  fireEvent.change(select, { target: { value: "map" } });
  expect(onMap).toHaveBeenCalledTimes(2);
  fireEvent.change(select, { target: { value: "device" } });
  expect(onLocate).toHaveBeenCalledOnce();
});

it("keeps manual selection available when device location is unsupported", () => {
  render(<LocationMethodSelect current="map" locating={false} unsupported onMap={vi.fn()} onLocate={vi.fn()} />);
  expect(screen.getByRole("combobox").hasAttribute("disabled")).toBe(false);
  expect(screen.getByRole("option", { name: /瀏覽器不支援/ }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("option", { name: "地圖選點（免定位）" }).hasAttribute("disabled")).toBe(false);
  expect(screen.getByRole("option", { name: "目前：地圖參考位置" })).toBeTruthy();
});

it("prevents switching methods while a device request is pending", () => {
  render(<LocationMethodSelect current={null} locating unsupported={false} onMap={vi.fn()} onLocate={vi.fn()} />);
  expect(screen.getByRole("combobox").hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("option", { name: "定位中…" })).toBeTruthy();
});
