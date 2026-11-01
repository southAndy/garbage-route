"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { feedbackUrls } from "@/lib/feedback";
import { cancelSurveyPrompt, answerSurvey, declineSurveyForm, dismissSurvey, openSurveyForm, submitSurveyReasons, useSurveyPrompt, type SurveyOutcome, type SurveyStep } from "@/lib/survey-prompt";
import { SURVEY_REASONS, type SurveyReason } from "@/lib/survey-options";

/**
 * The route-page survey sheet (see lib/survey-prompt.ts for when it appears). Step one is a
 * single tap and is recorded as an analytics event on its own; the Tally form is only offered
 * afterwards, in a new tab, so nobody has to load it to answer.
 */
export default function SurveyPrompt() {
  const pathname = usePathname();
  const { visible, context } = useSurveyPrompt();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<SurveyStep>("question");
  const [outcome, setOutcome] = useState<SurveyOutcome>("found");
  const [reason, setReason] = useState<SurveyReason | null | undefined>();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (visible && !element.open) {
      setStep("question"); setReason(undefined);
      element.showModal();
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = previous; };
    }
    if (!visible && element.open) element.close();
  }, [visible]);

  useEffect(() => {
    if (visible) heading.current?.focus();
  }, [visible, step]);

  useEffect(() => {
    if (!pathname.startsWith("/routes/")) cancelSurveyPrompt();
  }, [pathname]);

  if (!pathname.startsWith("/routes/")) return null;
  const formUrl = process.env.NEXT_PUBLIC_TALLY_FORM_URL;

  const choose = (next: SurveyOutcome) => {
    setOutcome(next);
    answerSurvey(next);
    setStep(next === "not_found" ? "reasons" : "invite");
  };
  const chooseReason = (next: SurveyReason | null) => {
    submitSurveyReasons(next);
    setReason(next);
    setStep("invite");
  };
  const openForm = () => {
    if (outcome === "in_progress") return;
    const urls = feedbackUrls(formUrl, { entry: "general", outcome, ...(context ?? {}) });
    openSurveyForm(outcome);
    if (urls) window.open(urls.share, "_blank", "noopener");
  };

  return <dialog ref={dialog} className="survey-prompt" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); dismissSurvey(step); }}
    onClick={(event) => { if (event.target === dialog.current) dismissSurvey(step); }}>
    <div className="survey-prompt-body">
      <span className="survey-prompt-grip" aria-hidden="true" />
      {step === "question" && <>
        <div className="survey-prompt-head">
          <div><h2 ref={heading} tabIndex={-1} id={titleId}>這次有找到你要的垃圾車時間嗎？</h2><p>選一項，幫我們了解這次查詢的情況。</p></div>
          <button type="button" className="survey-prompt-close" aria-label="關閉" onClick={() => dismissSurvey(step)}>×</button>
        </div>
        <div className="survey-prompt-actions survey-prompt-options">
          <button type="button" className="is-primary" onClick={() => choose("found")}>有，找到了</button>
          <button type="button" onClick={() => choose("not_found")}>查了，但沒找到</button>
          <button type="button" onClick={() => choose("in_progress")}>還在查／只是看看</button>
        </div>
        <p className="survey-prompt-fine">只記錄你的選擇與這條路線，不記錄位置。14 天內不會再問。</p>
      </>}
      {step === "reasons" && <>
        <div className="survey-prompt-head">
          <div><h2 ref={heading} tabIndex={-1} id={titleId}>主要遇到什麼問題？</h2><p>點一項就完成，之後可以改選。</p></div>
          <button type="button" className="survey-prompt-close" aria-label="關閉" onClick={() => dismissSurvey(step)}>×</button>
        </div>
        <div className="survey-prompt-chips" role="group" aria-label="找不到的原因">
          {SURVEY_REASONS.map((option) => <button key={option.value} type="button" className={reason === option.value ? "is-on" : ""} aria-pressed={reason === option.value} onClick={() => chooseReason(option.value)}>{option.label}</button>)}
        </div>
        <div className="survey-prompt-actions">
          <button type="button" onClick={() => chooseReason(null)}>略過</button>
        </div>
      </>}
      {step === "invite" && <>
        <div className="survey-prompt-head">
          <div>
            <p className="survey-prompt-thanks"><span aria-hidden="true">✓</span>謝謝你的回饋。</p>
            <h2 ref={heading} tabIndex={-1} id={titleId}>{outcome === "in_progress" ? "繼續查詢吧" : "願意多說一點嗎？"}</h2>
            <p>{outcome === "in_progress" ? "可以繼續查看路線與站點時間。" : `${formUrl ? "3 題、約 1 分鐘，會在新分頁開啟 Tally 問卷。" : ""}補充說明可以選填。`}</p>
          </div>
          <button type="button" className="survey-prompt-close" aria-label="關閉" onClick={() => dismissSurvey(step)}>×</button>
        </div>
        {outcome === "not_found" && reason !== undefined && <>
          <p className="survey-prompt-fine">{reason === null ? "已選擇略過原因" : `已選：${SURVEY_REASONS.find((option) => option.value === reason)?.label}`}</p>
          <div className="survey-prompt-actions"><button type="button" onClick={() => setStep("reasons")}>改選原因</button></div>
        </>}
        <div className="survey-prompt-actions">
          {formUrl && outcome !== "in_progress" && <button type="button" className="is-primary" onClick={openForm}>填 1 分鐘問卷 →</button>}
          <button type="button" className={formUrl && outcome !== "in_progress" ? "is-compact" : "is-primary"} onClick={() => declineSurveyForm(outcome)}>{outcome === "in_progress" ? "繼續查詢" : formUrl ? "不用了" : "完成"}</button>
        </div>
      </>}
    </div>
  </dialog>;
}
