// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CollectionPointFinder from "./collection-point-finder";
import type { CollectionPoint } from "../lib/collection-points";

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useSearchParams: () => new URLSearchParams(useSyncExternalStore(
    (listener) => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); },
    () => window.location.search, () => "",
  )) };
});
vi.mock("next/dynamic", () => ({ default: () => function TestMap({ points, selectedId, onSelect }: { points: CollectionPoint[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <div aria-label="測試地圖">{points.filter((point) => point.latitude !== null).map((point) => <button key={point.id} type="button" aria-pressed={point.id === selectedId} onClick={() => onSelect(point.id)}>地圖選取：{point.name}</button>)}</div>;
} }));

const points: CollectionPoint[] = [
  { id: "a", name: "較遠點", district: "中正區", address: "測試地址甲", notes: "週一收受", phone: "", latitude: 25.1, longitude: 121.6 },
  { id: "b", name: "較近點", district: "信義區", address: "測試地址乙", notes: "週二收受", phone: "", latitude: 25.03, longitude: 121.52 },
];
const districts = { TPE: ["中正區", "信義區", "大安區"], NTP: ["永和區"] };
const replaceState = window.history.replaceState.bind(window.history);
beforeEach(() => {
  replaceState(null, "", "/collection-points");
  // Simulate Next.js's integration of native history with useSearchParams.
  vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => {
    replaceState(data, unused, url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("定位僅在點擊後執行，依距離排序並可篩選行政區", () => {
  let resolve: PositionCallback;
  const locate = vi.fn((callback: PositionCallback) => { resolve = callback; });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: locate }, userAgent: "test" });
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  expect(locate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "依目前位置排序" }));
  act(() => resolve({ coords: { latitude: 25.03, longitude: 121.52 } } as GeolocationPosition));
  expect(screen.getAllByRole("heading", { level: 2 })[0].textContent).toBe("較近點");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "中正區" } });
  expect(screen.queryByText("較近點")).toBeNull();
  expect(screen.getByText("較遠點")).toBeTruthy();
  expect(new URLSearchParams(window.location.search).get("district")).toBe("中正區");
  expect(screen.getByText(/已依距離排序（限中正區）/)).toBeTruthy();
});
it("定位拒絕後仍可手動查詢，導航不包含使用者起點", () => {
  vi.stubGlobal("navigator", { userAgent: "test", geolocation: { getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) => fail({ code: 1 } as GeolocationPositionError) } });
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  fireEvent.click(screen.getByRole("button", { name: "依目前位置排序" }));
  expect(screen.getByRole("status").textContent).toContain("封鎖定位");
  expect(screen.getAllByRole("link", { name: /前往導航/ })[0].getAttribute("href")).not.toContain("origin=");
});
it("台北載入失敗保留官方入口，新北不冒充已有站點列表", () => {
  render(<CollectionPointFinder points={[]} failed districts={districts} />);
  expect(screen.getByText("暫時無法載入臺北收受點")).toBeTruthy();
  expect(screen.getByRole("link", { name: /臺北官方/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "新北市" }));
  expect(screen.getByRole("link", { name: /新北官方/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "依目前位置排序" })).toBeNull();
});
it("依網址預選行政區，可擴大範圍並隨返回的網址更新篩選", () => {
  window.history.replaceState(null, "", "/collection-points?city=TPE&district=信義區");
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("信義區");
  expect(screen.queryByText("較遠點")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "查看全臺北市" }));
  expect(screen.getByText("較遠點")).toBeTruthy();
  expect(new URLSearchParams(window.location.search).get("district")).toBeNull();
  act(() => { replaceState(null, "", "/collection-points?city=TPE&district=中正區"); window.dispatchEvent(new PopStateEvent("popstate")); });
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("中正區");
  expect(screen.queryByText("較近點")).toBeNull();
});
it("保留沒有收受點的有效行政區，提供擴大範圍而不默默顯示全市", () => {
  window.history.replaceState(null, "", "/collection-points?city=TPE&district=大安區");
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("大安區");
  expect(screen.getByText("大安區目前沒有收受點資料")).toBeTruthy();
  expect(screen.queryByText("較近點")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "顯示全部行政區" }));
  expect(screen.getByText("較近點")).toBeTruthy();
});
it("新北入口保留城市與行政區，切換城市時清除另一城市的行政區", () => {
  window.history.replaceState(null, "", "/collection-points?city=NTP&district=永和區");
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  expect(screen.getByRole("button", { name: "新北市" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("heading", { name: "新北市永和區限時定點收運" })).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "臺北市" }));
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
  expect(new URLSearchParams(window.location.search).get("district")).toBeNull();
});
it("手機列表選點切到地圖，地圖選點與返回列表保留同一選取項目", () => {
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  fireEvent.click(screen.getByRole("button", { name: "較遠點：在地圖查看" }));
  expect(screen.getByRole("button", { name: "地圖" }).getAttribute("aria-pressed")).toBe("true");
  const map = screen.getByLabelText("測試地圖");
  expect(within(map).getByRole("button", { name: "地圖選取：較遠點" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(within(map).getByRole("button", { name: "地圖選取：較近點" }));
  const detail = screen.getByLabelText("地圖選取的收受點");
  expect(within(detail).getByRole("heading", { name: "較近點" })).toBeTruthy();
  fireEvent.click(within(detail).getByRole("button", { name: "查看列表詳情" }));
  const list = screen.getByRole("list", { name: "限時收受點列表" });
  const selected = within(list).getByRole("listitem", { name: "較近點" });
  expect(selected.classList.contains("is-selected")).toBe(true);
  expect(selected).toBe(document.activeElement);
  expect(screen.queryByLabelText("測試地圖")).toBeNull();
});
it("篩選掉已選取地點時，地圖與列表不保留不相符的詳情", () => {
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  fireEvent.click(screen.getByRole("button", { name: "較遠點：在地圖查看" }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "信義區" } });
  expect(screen.queryByLabelText("地圖選取的收受點")).toBeNull();
  expect(screen.queryByRole("button", { name: "地圖選取：較遠點" })).toBeNull();
  expect(screen.getByRole("button", { name: "地圖選取：較近點" }).getAttribute("aria-pressed")).toBe("false");
});
