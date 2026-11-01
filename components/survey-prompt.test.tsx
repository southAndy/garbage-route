// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SurveyPrompt from "./survey-prompt";
import { requestSurveyPrompt, resetSurveyPromptForTests, SURVEY_DWELL_MS } from "@/lib/survey-prompt";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@vercel/analytics", () => ({ track }));
vi.mock("next/navigation", () => ({ usePathname: () => "/routes/test" }));
const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(null, { status: 202 })));
const context = { route_id: "r", city: "NTP", district: "永和區" };

function showSurvey() {
  render(<SurveyPrompt />);
  act(() => {
    requestSurveyPrompt("stop_dwell", context);
    vi.advanceTimersByTime(SURVEY_DWELL_MS);
  });
}
function records() { return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body))); }

describe("survey version 2 UI", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_TALLY_FORM_URL", "https://tally.so/r/abc");
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
    window.localStorage.clear(); window.sessionStorage.clear();
    resetSurveyPromptForTests(); track.mockClear(); fetchMock.mockClear();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("還在查獨立記錄，讓使用者直接繼續查詢", () => {
    showSurvey();
    fireEvent.click(screen.getByRole("button", { name: "還在查／只是看看" }));
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ outcome: "in_progress", survey_version: "2" });
    expect(screen.queryByRole("button", { name: "填 1 分鐘問卷 →" })).toBeNull();
    expect(screen.queryByRole("group", { name: "找不到的原因" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "繼續查詢" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("原因一點即送出、改選不重複計首次作答，重選相同原因不重送", () => {
    showSurvey();
    fireEvent.click(screen.getByRole("button", { name: "查了，但沒找到" }));
    expect(screen.queryByRole("button", { name: "送出" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "時間跟實際到站不同" }));
    expect(records()).toHaveLength(2);
    expect(records()[1]).toMatchObject({ outcome: "not_found", reasons: "time_mismatch", reason_revision: 1, feedback_id: records()[0].feedback_id });
    fireEvent.click(screen.getByRole("button", { name: "改選原因" }));
    fireEvent.click(screen.getByRole("button", { name: "不知道怎麼操作" }));
    expect(records()).toHaveLength(3);
    expect(records()[2]).toMatchObject({ reasons: "hard_to_use", reason_revision: 2, feedback_id: records()[0].feedback_id });
    fireEvent.click(screen.getByRole("button", { name: "改選原因" }));
    fireEvent.click(screen.getByRole("button", { name: "不知道怎麼操作" }));
    expect(records()).toHaveLength(3);
    expect(track.mock.calls.filter(([event]) => event === "survey_answered")).toHaveLength(1);
    expect(track.mock.calls.filter(([event]) => event === "survey_reasons")).toHaveLength(1);
    expect(track.mock.calls.filter(([event]) => event === "survey_reasons_changed")).toHaveLength(1);
    expect(document.activeElement?.textContent).toBe("願意多說一點嗎？");
  });

  it("略過與直接關閉原因題分開處理", () => {
    showSurvey();
    fireEvent.click(screen.getByRole("button", { name: "查了，但沒找到" }));
    fireEvent.click(screen.getByRole("button", { name: "略過" }));
    expect(records()[1]).toMatchObject({ reasons: "skipped", reason_revision: 1 });
    fireEvent.click(screen.getByRole("button", { name: "改選原因" }));
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    expect(records()).toHaveLength(2);
    expect(track).toHaveBeenCalledWith("survey_dismissed", expect.objectContaining({ step: "reasons", survey_version: "2" }));
  });

  it("找到直接到選填問卷", () => {
    showSurvey();
    fireEvent.click(screen.getByRole("button", { name: "有，找到了" }));
    expect(records()[0]).toMatchObject({ outcome: "found" });
    expect(screen.getByRole("button", { name: "填 1 分鐘問卷 →" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "改選原因" })).toBeNull();
  });

  it("直接關閉原因題不冒充明確略過", () => {
    showSurvey();
    fireEvent.click(screen.getByRole("button", { name: "查了，但沒找到" }));
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ outcome: "not_found" });
    expect(track).not.toHaveBeenCalledWith("survey_reasons", expect.anything());
  });
});
