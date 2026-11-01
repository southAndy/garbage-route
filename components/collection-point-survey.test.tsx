// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CollectionPointFinder from "./collection-point-finder";
import { cancelSurveyPrompt, requestSurveyPrompt, resetSurveyPromptForTests } from "@/lib/survey-prompt";
import type { CollectionPoint } from "@/lib/collection-points";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@vercel/analytics", () => ({ track }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useSearchParams: () => new URLSearchParams(useSyncExternalStore(
    (listener) => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); },
    () => window.location.search, () => "",
  )) };
});
vi.mock("next/dynamic", () => ({ default: () => function TestMap({ points, onSelect }: { points: CollectionPoint[]; onSelect: (id: string) => void }) {
  return <div>{points.map((point) => <button key={point.id} type="button" onClick={() => onSelect(point.id)}>選取標記 {point.name}</button>)}</div>;
} }));
const points: CollectionPoint[] = [
  { id: "point-a", name: "松山點", district: "松山區", address: "地址甲", notes: "開放時間06：00~23：00", phone: "", latitude: 25.05, longitude: 121.56 },
  { id: "point-b", name: "大安點", district: "大安區", address: "地址乙", notes: "週三收受", phone: "", latitude: 25.03, longitude: 121.54 },
];
const districts = { TPE: ["松山區", "大安區", "信義區"], NTP: ["永和區"] };
const replaceState = window.history.replaceState.bind(window.history);
const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
let visibility: ReturnType<typeof vi.spyOn>;
let observers: Array<{ targets: Set<Element>; callback: IntersectionObserverCallback; disconnected: boolean }>;
const question = "這頁有幫助你找到收受地點與時間嗎？";
function advance(ms: number) { act(() => vi.advanceTimersByTime(ms)); }
function intersect(selector: string, visible = true, ratio = 1) {
  const target = document.querySelector(selector)!;
  expect(target).toBeTruthy();
  const current = observers.filter((observer) => !observer.disconnected && observer.targets.has(target));
  expect(current.length).toBeGreaterThan(0);
  act(() => current.forEach((observer) => observer.callback([{ target, isIntersecting: visible, intersectionRatio: ratio }] as IntersectionObserverEntry[], {} as IntersectionObserver)));
}
function showListSurvey() {
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  intersect('[data-survey-card="point-a"]');
  advance(20_000);
}
function records() { return fetchMock.mock.calls.map((args) => JSON.parse(String((args as unknown as [string, RequestInit])[1].body))); }

beforeEach(() => {
  vi.useFakeTimers(); observers = [];
  window.localStorage.clear(); window.sessionStorage.clear(); resetSurveyPromptForTests();
  replaceState(null, "", "/collection-points?city=TPE&district=松山區");
  vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => { replaceState(data, unused, url); window.dispatchEvent(new PopStateEvent("popstate")); });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("IntersectionObserver", class {
    state: typeof observers[number];
    constructor(callback: IntersectionObserverCallback) { this.state = { targets: new Set(), callback, disconnected: false }; observers.push(this.state); }
    observe(target: Element) { this.state.targets.add(target); }
    disconnect() { this.state.disconnected = true; }
  });
  visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockClear(); track.mockClear();
  vi.stubEnv("NEXT_PUBLIC_TALLY_FORM_URL", "https://tally.so/r/abc");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); resetSurveyPromptForTests(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("列表至少一半可見才計時，20 秒後在卡片下顯示，不自動移動焦點", () => {
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  advance(60_000);
  expect(screen.queryByText(question)).toBeNull();
  intersect('[data-survey-card="point-a"]', true, 0.4); advance(30_000);
  expect(screen.queryByText(question)).toBeNull();
  intersect('[data-survey-card="point-a"]'); advance(19_999);
  expect(screen.queryByText(question)).toBeNull(); advance(1);
  const card = screen.getByRole("listitem", { name: "松山點" });
  expect(within(card).getByText(question)).toBeTruthy();
  expect(document.activeElement).toBe(document.body);
  expect(track).toHaveBeenCalledWith("collection_survey_shown", expect.objectContaining({ point_id: "point-a", trigger: "collection_list_dwell", view_mode: "list", city: "TPE", district: "松山區" }));
});
it("切到背景與離開卡片時暫停，回到畫面延續剩餘閱讀時間", () => {
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  intersect('[data-survey-card="point-a"]'); advance(8_000);
  act(() => { visibility.mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange")); });
  advance(60_000); expect(screen.queryByText(question)).toBeNull();
  act(() => { visibility.mockReturnValue("visible"); document.dispatchEvent(new Event("visibilitychange")); });
  advance(5_000);
  intersect('[data-survey-card="point-a"]', false); advance(60_000);
  expect(screen.queryByText(question)).toBeNull();
  intersect('[data-survey-card="point-a"]'); advance(6_999);
  expect(screen.queryByText(question)).toBeNull(); advance(1);
  expect(screen.getByText(question)).toBeTruthy();
});
it("回饋表單開著時不計時，關閉後延續", async () => {
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  intersect('[data-survey-card="point-a"]'); advance(10_000);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "提供收受點建議" })));
  advance(60_000); expect(screen.queryByText(question)).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "關閉回饋表單" })));
  advance(9_999); expect(screen.queryByText(question)).toBeNull(); advance(1);
  expect(screen.getByText(question)).toBeTruthy();
});
it("地圖需先選點並閱讀詳情 20 秒，選取其他點重新計時", () => {
  replaceState(null, "", "/collection-points?city=TPE");
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  fireEvent.click(screen.getByRole("button", { name: "地圖" })); advance(30_000);
  expect(screen.queryByText(question)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "選取標記 松山點" }));
  intersect("[data-survey-map-detail]"); advance(10_000);
  fireEvent.click(screen.getByRole("button", { name: "選取標記 大安點" }));
  intersect("[data-survey-map-detail]"); advance(19_999);
  expect(screen.queryByText(question)).toBeNull(); advance(1);
  expect(within(screen.getByLabelText("地圖選取的收受點")).getByText(question)).toBeTruthy();
  expect(track).toHaveBeenCalledWith("collection_survey_shown", expect.objectContaining({ point_id: "point-b", trigger: "collection_map_dwell", view_mode: "map" }));
});
it("空結果停留 8 秒問原因，選答前不記錄失敗，回答後可補充建議", () => {
  replaceState(null, "", "/collection-points?city=TPE&district=信義區");
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  intersect("[data-survey-empty]"); advance(7_999);
  expect(screen.queryByText("這次沒找到的主要原因？")).toBeNull(); advance(1);
  expect(screen.getByText("這次沒找到的主要原因？")).toBeTruthy();
  expect(records()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "本區沒有收受點" }));
  expect(records()).toHaveLength(2);
  expect(records()[0]).toMatchObject({ event: "survey_answered", outcome: "not_found", page_type: "collection_points", trigger: "collection_empty_dwell", district: "信義區" });
  expect(records()[1]).toMatchObject({ reasons: "no_points", reason_revision: 1, feedback_id: records()[0].feedback_id });
  expect(records()[0]).not.toHaveProperty("point_id");
  expect(screen.getByRole("button", { name: "補充建議（選填）" })).toBeTruthy();
});
it("快速更換行政區取消舊空結果計時，資料載入失敗不觸發問卷", () => {
  replaceState(null, "", "/collection-points?city=TPE&district=信義區");
  const view = render(<CollectionPointFinder points={points} failed={false} districts={districts} />);
  intersect("[data-survey-empty]"); advance(7_000);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "松山區" } });
  advance(30_000); expect(screen.queryByText("這次沒找到的主要原因？")).toBeNull();
  view.rerender(<CollectionPointFinder points={[]} failed districts={districts} />);
  advance(30_000); expect(track).not.toHaveBeenCalledWith("collection_survey_shown", expect.anything());
});
it.each(["有，找到了", "還在找"])("%s 回答後可開啟既有 Tally 表單，帶入收受點情境", (label) => {
  showListSurvey(); fireEvent.click(screen.getByRole("button", { name: label }));
  expect(records()).toHaveLength(1);
  expect(records()[0]).toMatchObject({ page_type: "collection_points", point_id: "point-a", view_mode: "list", outcome: label === "還在找" ? "in_progress" : "found" });
  expect(document.querySelector("iframe")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "補充建議（選填）" }));
  const iframe = screen.getByTitle("補充建議（選填）表單");
  const params = new URL(iframe.getAttribute("src")!).searchParams;
  expect(params.get("entry")).toBe("collection_points"); expect(params.get("point_id")).toBe("point-a");
  expect(params.get("district")).toBe("松山區"); expect(params.get("view_mode")).toBe("list");
  expect(params.has("lat")).toBe(false); expect(params.has("lng")).toBe(false);
  expect(track).toHaveBeenCalledWith("collection_survey_form_opened", expect.anything());
});
it("沒找到可略過或改選原因，重選相同原因不重送", () => {
  showListSurvey(); fireEvent.click(screen.getByRole("button", { name: "查了，但沒找到" }));
  fireEvent.click(screen.getByRole("button", { name: "略過原因" }));
  expect(records()[1]).toMatchObject({ reasons: "skipped", reason_revision: 1 });
  fireEvent.click(screen.getByRole("button", { name: "改選原因" }));
  fireEvent.click(screen.getByRole("button", { name: "看不懂時間或規定" }));
  expect(records()[2]).toMatchObject({ reasons: "unreadable_hours", reason_revision: 2 });
  fireEvent.click(screen.getByRole("button", { name: "改選原因" }));
  fireEvent.click(screen.getByRole("button", { name: "看不懂時間或規定" }));
  expect(records()).toHaveLength(3);
});
it("與路線頁同次只問一次，回答或關閉後 14 天冷卻，仍可主動回饋", () => {
  showListSurvey(); fireEvent.click(screen.getByRole("button", { name: "關閉收受點問卷" }));
  requestSurveyPrompt("stop_dwell", { route_id: "r", city: "TPE", district: "松山區" }); advance(20_000);
  expect(track).not.toHaveBeenCalledWith("survey_shown", expect.anything());
  cleanup(); resetSurveyPromptForTests(); window.sessionStorage.clear();
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />); advance(30_000);
  expect(screen.queryByText(question)).toBeNull();
  expect(screen.getByRole("button", { name: "提供收受點建議" })).toBeTruthy();
});
it("路線頁先顯示問卷時，收受點不重複詢問；離開路線可取消待出現的問卷", () => {
  requestSurveyPrompt("stop_dwell", { route_id: "r", city: "TPE", district: "松山區" }); advance(20_000);
  render(<CollectionPointFinder points={points} failed={false} districts={districts} />); advance(30_000);
  expect(screen.queryByText(question)).toBeNull();
  expect(track).not.toHaveBeenCalledWith("collection_survey_shown", expect.anything());
  cleanup(); resetSurveyPromptForTests(); window.localStorage.clear(); window.sessionStorage.clear(); track.mockClear();
  requestSurveyPrompt("stop_dwell", { route_id: "old", city: "TPE", district: "松山區" }); advance(10_000);
  cancelSurveyPrompt("old"); advance(20_000);
  expect(track).not.toHaveBeenCalled();
  showListSurvey(); expect(screen.getByText(question)).toBeTruthy();
});
