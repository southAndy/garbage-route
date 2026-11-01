"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { track } from "@vercel/analytics";
import { canShowSurvey, claimSurvey, completeSurvey } from "./survey-frequency";
import { markVisited, type SurveyVisit } from "./survey-prompt";
import type { SurveyOutcome } from "./survey-options";
import type { CollectionSurveyRecord } from "./survey-store";
import { COLLECTION_SURVEY_DWELL_MS, COLLECTION_SURVEY_EMPTY_DWELL_MS, COLLECTION_SURVEY_VERSION,
  type CollectionSurveyContext, type CollectionSurveyReason } from "./collection-survey-options";
import type { CityCode } from "./types";

export interface CollectionSurveyPrompt {
  id: string;
  context: CollectionSurveyContext;
  visit: SurveyVisit;
  step: "question" | "reasons" | "invite";
  outcome: SurveyOutcome | null;
  reason?: CollectionSurveyReason | null;
  revision: number;
}
interface Options {
  root: RefObject<HTMLElement | null>;
  city: CityCode;
  district: string;
  view: "list" | "map";
  selectedId: string | null;
  isDesktop: boolean;
  empty: boolean;
  enabled: boolean;
  /** Re-observe when filtering or sorting replaces/reorders the cards. */
  pointsKey: string;
}

function event(name: string, prompt: CollectionSurveyPrompt, extra: Record<string, string> = {}) {
  try { track(name, { ...prompt.context, survey_version: COLLECTION_SURVEY_VERSION, visit: prompt.visit, ...extra }); } catch { /* Optional analytics. */ }
}
function store(record: CollectionSurveyRecord) {
  try {
    void fetch("/api/survey", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify(record) }).catch(() => {});
  } catch { /* The optional storage transport must not interrupt browsing. */ }
}
function recordBase(prompt: CollectionSurveyPrompt) {
  return { ...prompt.context, feedback_id: prompt.id, survey_version: COLLECTION_SURVEY_VERSION, visit: prompt.visit } as const;
}
function recordAnswer(prompt: CollectionSurveyPrompt, outcome: SurveyOutcome) {
  completeSurvey();
  event("collection_survey_answered", prompt, { outcome });
  store({ ...recordBase(prompt), event: "survey_answered", outcome });
}

export function useCollectionSurvey({ root, city, district, view, selectedId, isDesktop, empty, enabled, pointsKey }: Options) {
  const [prompt, setPrompt] = useState<CollectionSurveyPrompt | null>(null);
  const current = useRef<CollectionSurveyPrompt | null>(null);
  const dwell = useRef({ key: "", remaining: COLLECTION_SURVEY_DWELL_MS });

  useEffect(() => {
    if (!enabled || current.current || !root.current || !canShowSurvey() || typeof IntersectionObserver === "undefined") return;
    const kind = empty ? "empty" : view;
    if (kind === "map" && !selectedId) return;
    const key = `${city}|${district}|${kind}|${kind === "map" ? selectedId : ""}`;
    if (dwell.current.key !== key) dwell.current = { key, remaining: empty ? COLLECTION_SURVEY_EMPTY_DWELL_MS : COLLECTION_SURVEY_DWELL_MS };
    const cards = Array.from(root.current.querySelectorAll<HTMLElement>("[data-survey-card]"));
    const targets = kind === "empty" ? Array.from(root.current.querySelectorAll<HTMLElement>("[data-survey-empty]"))
      : kind === "list" ? cards
      : isDesktop ? cards.filter((card) => card.dataset.surveyCard === selectedId)
      : Array.from(root.current.querySelectorAll<HTMLElement>("[data-survey-map-detail]"));
    const visible = new Set<Element>();
    let timer: number | null = null;
    let since: number | null = null;
    let disposed = false;
    const pause = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (since !== null) dwell.current.remaining = Math.max(0, dwell.current.remaining - (Date.now() - since));
      since = null;
    };
    const reading = () => document.visibilityState === "visible" && visible.size > 0 && !document.querySelector("dialog[open]");
    const sync = () => {
      if (disposed) return;
      if (!reading() || !canShowSurvey()) { pause(); return; }
      if (timer !== null) return;
      since = Date.now();
      timer = window.setTimeout(() => {
        timer = null;
        since = null;
        dwell.current.remaining = 0;
        if (disposed || !reading() || !claimSurvey()) return;
        const pointId = kind === "map" ? selectedId : targets.find((target) => visible.has(target))?.dataset.surveyCard;
        const next: CollectionSurveyPrompt = {
          id: window.crypto.randomUUID(), context: { page_type: "collection_points", city, district, view_mode: view,
            ...(pointId ? { point_id: pointId } : {}),
            trigger: kind === "empty" ? "collection_empty_dwell" : kind === "map" ? "collection_map_dwell" : "collection_list_dwell" },
          visit: markVisited(), step: empty ? "reasons" : "question", outcome: null, revision: 0,
        };
        current.current = next;
        setPrompt(next);
        event("collection_survey_shown", next);
      }, dwell.current.remaining);
    };
    const observer = new IntersectionObserver((entries) => {
      if (disposed) return;
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) visible.add(entry.target); else visible.delete(entry.target);
      }
      sync();
    }, { threshold: 0.5 });
    for (const target of targets) observer.observe(target);
    document.addEventListener("visibilitychange", sync);
    const modals = new MutationObserver(sync);
    modals.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => {
      disposed = true;
      pause();
      observer.disconnect();
      modals.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [root, city, district, view, selectedId, isDesktop, empty, enabled, pointsKey]);

  function update(next: CollectionSurveyPrompt | null) { current.current = next; setPrompt(next); }
  function answer(outcome: SurveyOutcome) {
    const previous = current.current;
    if (!previous || previous.outcome || previous.step !== "question") return;
    recordAnswer(previous, outcome);
    update({ ...previous, outcome, step: outcome === "not_found" ? "reasons" : "invite" });
  }
  function chooseReason(reason: CollectionSurveyReason | null) {
    const previous = current.current;
    if (!previous || previous.step !== "reasons") return;
    if (previous.revision && previous.reason === reason) { update({ ...previous, step: "invite" }); return; }
    // An empty-result prompt does not claim a negative answer until a person chooses a reason.
    if (!previous.outcome) recordAnswer(previous, "not_found");
    const revision = previous.revision + 1;
    const reasons = reason ?? "skipped";
    event(previous.revision ? "collection_survey_reasons_changed" : "collection_survey_reasons", previous,
      { outcome: "not_found", reasons, reason_revision: String(revision) });
    store({ ...recordBase(previous), event: "survey_reasons", outcome: "not_found", reasons, reason_revision: revision });
    update({ ...previous, step: "invite", outcome: "not_found", reason, revision });
  }
  function dismiss() {
    const previous = current.current;
    if (!previous) return;
    completeSurvey();
    event("collection_survey_dismissed", previous, { step: previous.step });
    update(null);
  }
  function editReason() {
    const previous = current.current;
    if (previous?.outcome === "not_found") update({ ...previous, step: "reasons" });
  }
  function formOpened() {
    const previous = current.current;
    if (previous) event("collection_survey_form_opened", previous, previous.outcome ? { outcome: previous.outcome } : {});
  }

  return { prompt: prompt?.context.city === city && prompt.context.district === district ? prompt : null,
    answer, chooseReason, dismiss, editReason, formOpened };
}
export type CollectionSurveyController = ReturnType<typeof useCollectionSurvey>;
