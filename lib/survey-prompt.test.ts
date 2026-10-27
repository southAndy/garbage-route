// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(null, { status: 202 })));
vi.mock("@vercel/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));
vi.stubGlobal("fetch", fetchMock);

import { answerSurvey, dismissSurvey, markVisited, requestSurveyPrompt, resetSurveyPromptForTests, setSurveyBlocked, submitSurveyReasons, SURVEY_DWELL_MS, useSurveyPrompt } from "./survey-prompt";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const context = { route_id: "ntp-234001", city: "NTP", district: "永和區" };
function Probe() { return createElement("i", null, String(useSurveyPrompt().visible)); }

describe("survey prompt", () => {
  beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); window.sessionStorage.clear(); track.mockClear(); fetchMock.mockClear(); resetSurveyPromptForTests(); });
  afterEach(() => { vi.useRealTimers(); });

  it("互動後停留 20 秒才顯示，並送出 survey_shown", () => {
    requestSurveyPrompt("stop_dwell", context);
    vi.advanceTimersByTime(SURVEY_DWELL_MS - 1);
    expect(track).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(track).toHaveBeenCalledWith("survey_shown", { trigger: "stop_dwell", ...context, visit: "first" });
    expect(window.sessionStorage.getItem("survey-prompt-shown")).toBe("1");
  });

  it("第一個觸發為準，第二次來訪標記 return", () => {
    window.localStorage.setItem("visited-before", "1");
    requestSurveyPrompt("stop_nav", context);
    requestSurveyPrompt("stop_dwell", context);
    vi.advanceTimersByTime(SURVEY_DWELL_MS);
    expect(track).toHaveBeenCalledWith("survey_shown", expect.objectContaining({ trigger: "stop_nav", visit: "return" }));
  });

  it("被擋住時等到解除才顯示", () => {
    requestSurveyPrompt("stop_dwell", context);
    setSurveyBlocked(true);
    vi.advanceTimersByTime(SURVEY_DWELL_MS);
    expect(track).not.toHaveBeenCalled();
    setSurveyBlocked(false);
    expect(track).toHaveBeenCalledWith("survey_shown", expect.anything());
  });

  it("回答或關掉後 14 天內不再問，同一個 session 也只問一次", () => {
    requestSurveyPrompt("stop_dwell", context);
    vi.advanceTimersByTime(SURVEY_DWELL_MS);
    answerSurvey("not_found");
    submitSurveyReasons(["time_mismatch", "stop_location"]);
    expect(track).toHaveBeenCalledWith("survey_answered", { outcome: "not_found", ...context, visit: "first" });
    expect(track).toHaveBeenCalledWith("survey_reasons", { reasons: "time_mismatch,stop_location", ...context });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const posted = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(posted[0]).toEqual({ event: "survey_answered", outcome: "not_found", visit: "first", ...context });
    expect(posted[1]).toEqual({ event: "survey_reasons", reasons: "time_mismatch,stop_location", ...context });
    expect(fetchMock.mock.calls[0][1]?.keepalive).toBe(true);
    dismissSurvey("invite");
    expect(track).toHaveBeenCalledWith("survey_dismissed", { step: "invite", ...context });
    expect(Number(window.localStorage.getItem("survey-prompt-done"))).toBeGreaterThan(0);

    track.mockClear(); resetSurveyPromptForTests(); window.sessionStorage.clear();
    requestSurveyPrompt("stop_dwell", context);
    vi.advanceTimersByTime(SURVEY_DWELL_MS);
    expect(track).not.toHaveBeenCalled();

    window.localStorage.setItem("survey-prompt-done", String(Date.now() - 15 * 24 * 60 * 60 * 1000));
    resetSurveyPromptForTests();
    requestSurveyPrompt("stop_dwell", context);
    vi.advanceTimersByTime(SURVEY_DWELL_MS);
    expect(track).toHaveBeenCalledWith("survey_shown", expect.anything());
  });

  it("另存失敗不影響問卷", () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    requestSurveyPrompt("stop_dwell", context);
    vi.advanceTimersByTime(SURVEY_DWELL_MS);
    expect(() => answerSurvey("found")).not.toThrow();
    expect(track).toHaveBeenCalledWith("survey_answered", expect.objectContaining({ outcome: "found" }));
  });

  it("伺服器端永遠不顯示", () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<i>false</i>");
    expect(markVisited()).toBe("first");
  });
});
