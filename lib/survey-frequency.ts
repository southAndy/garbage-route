/** Shared by route and collection surveys: one prompt per tab session, then
 * fourteen days of quiet after an answer or dismissal. In-memory state also
 * protects users whose browser blocks storage. */
export const SURVEY_SUPPRESS_DAYS = 14;
const DONE_KEY = "survey-prompt-done";
const SESSION_KEY = "survey-prompt-shown";
let claimed = false;
let quietUntil = 0;

export function canShowSurvey(now = Date.now()) {
  if (typeof window === "undefined" || claimed || now < quietUntil) return false;
  try { if (window.sessionStorage.getItem(SESSION_KEY) === "1") return false; } catch { /* Use memory instead. */ }
  try {
    const done = Number(window.localStorage.getItem(DONE_KEY));
    if (Number.isFinite(done) && done > 0 && now - done < SURVEY_SUPPRESS_DAYS * 86_400_000) return false;
  } catch { /* Use memory instead. */ }
  return true;
}

export function claimSurvey() {
  if (!canShowSurvey()) return false;
  claimed = true;
  try { window.sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* Session is already claimed in memory. */ }
  return true;
}

export function completeSurvey() {
  const now = Date.now();
  quietUntil = now + SURVEY_SUPPRESS_DAYS * 86_400_000;
  try { window.localStorage.setItem(DONE_KEY, String(now)); } catch { /* Keep the in-memory limit. */ }
}

export function resetSurveyFrequencyForTests() { claimed = false; quietUntil = 0; }
