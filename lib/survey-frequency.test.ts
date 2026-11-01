// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { canShowSurvey, claimSurvey, completeSurvey, resetSurveyFrequencyForTests } from "./survey-frequency";
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); resetSurveyFrequencyForTests(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("顯示即共用同次瀏覽限制，重新掛載也不重複詢問", () => {
  expect(claimSurvey()).toBe(true); expect(claimSurvey()).toBe(false);
  resetSurveyFrequencyForTests(); expect(canShowSurvey()).toBe(false);
});
it("回答或關閉後十四天才可再問，沿用既有 localStorage 設定", () => {
  completeSurvey(); resetSurveyFrequencyForTests();
  expect(canShowSurvey()).toBe(false);
  expect(canShowSurvey(Date.now() + 14 * 86_400_000)).toBe(true);
});
it("儲存空間遭封鎖時，記憶體仍阻止同次重複詢問", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(claimSurvey()).toBe(true); expect(claimSurvey()).toBe(false);
  expect(() => completeSurvey()).not.toThrow(); expect(canShowSurvey()).toBe(false);
});
it("伺服器端不提供問卷曝光資格", () => {
  vi.stubGlobal("window", undefined); expect(canShowSurvey()).toBe(false);
});
