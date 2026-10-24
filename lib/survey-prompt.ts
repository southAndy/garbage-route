import { useSyncExternalStore } from "react";
import { track } from "@vercel/analytics";

/**
 * The route-page survey: a two-step sheet (one tap "did you find it?", optional reasons, then an
 * invitation to the Tally form) that appears once the person has actually used the page.
 *
 * Timing: a stop interaction starts a 20 s dwell timer; while the search panel or the popup
 * details are open the sheet waits (`setSurveyBlocked`). Frequency: once per browser session,
 * and after an answer or a dismissal not again for 14 days. Every step sends a Vercel event
 * so the funnel can be read without the form.
 */
export type SurveyTrigger = "stop_dwell" | "stop_nav";
export type SurveyStep = "question" | "reasons" | "invite";
export type SurveyOutcome = "found" | "not_found";
export type SurveyVisit = "first" | "return";
export interface SurveyRouteContext { route_id: string; city: string; district: string }
export interface SurveyPromptState { visible: boolean; trigger: SurveyTrigger | null; context: SurveyRouteContext | null; visit: SurveyVisit }

export const SURVEY_DWELL_MS = 20_000;
export const SURVEY_SUPPRESS_DAYS = 14;
const DONE_KEY = "survey-prompt-done";
const SESSION_KEY = "survey-prompt-shown";
const VISITED_KEY = "visited-before";

let state: SurveyPromptState = { visible: false, trigger: null, context: null, visit: "first" };
let timer: number | null = null;
let pending = false;
let blocked = false;
let visitKind: SurveyVisit | null = null;
const listeners = new Set<() => void>();

function emit() { for (const listener of listeners) listener(); }
function patch(next: Partial<SurveyPromptState>) { state = { ...state, ...next }; emit(); }

function readLocal(key: string) { try { return window.localStorage.getItem(key); } catch { return null; } }
function writeLocal(key: string, value: string) { try { window.localStorage.setItem(key, value); } catch { /* Blocked storage: the session flag still holds. */ } }
function sessionShown() { try { return window.sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; } }
function rememberSession() { try { window.sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ } }

function suppressed(now = Date.now()) {
  const done = Number(readLocal(DONE_KEY));
  return Number.isFinite(done) && done > 0 && now - done < SURVEY_SUPPRESS_DAYS * 24 * 60 * 60 * 1000;
}
function markDone() { writeLocal(DONE_KEY, String(Date.now())); }

function send(event: string, properties: Record<string, string>) {
  try { track(event, properties); } catch { /* Analytics never blocks the survey. */ }
}
function contextProps() { return state.context ? { ...state.context } : {}; }

/** Called once per page load; whether this browser has been here before decides `visit`. */
export function markVisited(): SurveyVisit {
  if (visitKind) return visitKind;
  visitKind = readLocal(VISITED_KEY) ? "return" : "first";
  writeLocal(VISITED_KEY, "1");
  state = { ...state, visit: visitKind };
  return visitKind;
}

function show() {
  pending = false;
  rememberSession();
  patch({ visible: true });
  send("survey_shown", { trigger: state.trigger ?? "stop_dwell", ...contextProps(), visit: state.visit });
}

/** Start (or keep) the dwell timer after a meaningful interaction. The first trigger wins. */
export function requestSurveyPrompt(trigger: SurveyTrigger, context: SurveyRouteContext) {
  if (state.visible || pending || timer !== null || sessionShown() || suppressed()) return;
  state = { ...state, trigger, context, visit: markVisited() };
  timer = window.setTimeout(() => {
    timer = null;
    if (blocked) pending = true; else show();
  }, SURVEY_DWELL_MS);
}

/** While something else needs the screen (search panel, popup details), a due prompt waits. */
export function setSurveyBlocked(next: boolean) {
  blocked = next;
  if (!blocked && pending) show();
}

export function answerSurvey(outcome: SurveyOutcome) {
  markDone();
  send("survey_answered", { outcome, ...contextProps(), visit: state.visit });
}

export function submitSurveyReasons(reasons: string[]) {
  send("survey_reasons", { reasons: reasons.length ? reasons.join(",") : "skipped", ...contextProps() });
}

export function openSurveyForm(outcome: SurveyOutcome) {
  send("survey_form_opened", { outcome, ...contextProps() });
  patch({ visible: false });
}

export function declineSurveyForm(outcome: SurveyOutcome) {
  send("survey_form_declined", { outcome, ...contextProps() });
  patch({ visible: false });
}

/** Closed without finishing the step; counts as "asked" for the next 14 days. */
export function dismissSurvey(step: SurveyStep) {
  if (timer !== null) { window.clearTimeout(timer); timer = null; }
  pending = false;
  if (!state.visible) return;
  markDone();
  send("survey_dismissed", { step, ...contextProps() });
  patch({ visible: false });
}

function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
const serverState: SurveyPromptState = { visible: false, trigger: null, context: null, visit: "first" };
export function useSurveyPrompt() { return useSyncExternalStore(subscribe, () => state, () => serverState); }

/** Test hook: back to a fresh page load. */
export function resetSurveyPromptForTests() {
  if (timer !== null) { window.clearTimeout(timer); timer = null; }
  pending = false; blocked = false; visitKind = null;
  state = { visible: false, trigger: null, context: null, visit: "first" };
}
