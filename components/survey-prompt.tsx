"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { feedbackUrls } from "@/lib/feedback";
import { answerSurvey, declineSurveyForm, dismissSurvey, openSurveyForm, submitSurveyReasons, useSurveyPrompt, type SurveyOutcome, type SurveyStep } from "@/lib/survey-prompt";

const REASONS: { value: string; label: string }[] = [
  { value: "no_route", label: "找不到我家的路線" },
  { value: "time_mismatch", label: "時間和實際不符" },
  { value: "stop_location", label: "站點位置不對" },
  { value: "hard_to_use", label: "不知道怎麼用" },
  { value: "other", label: "其他" },
];

/**
 * The route-page survey sheet (see lib/survey-prompt.ts for when it appears). Step one is a
 * single tap and is recorded as an analytics event on its own; the Tally form is only offered
 * afterwards, in a new tab, so nobody has to load it to answer.
 */
export default function SurveyPrompt() {
  const pathname = usePathname();
  const { visible, context } = useSurveyPrompt();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<SurveyStep>("question");
  const [outcome, setOutcome] = useState<SurveyOutcome>("found");
  const [reasons, setReasons] = useState<string[]>([]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (visible && !element.open) {
      setStep("question"); setReasons([]);
      element.showModal();
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = previous; };
    }
    if (!visible && element.open) element.close();
  }, [visible]);

  if (pathname === "/") return null;
  const formUrl = process.env.NEXT_PUBLIC_TALLY_FORM_URL;

  const choose = (next: SurveyOutcome) => {
    setOutcome(next);
    answerSurvey(next);
    setStep(next === "found" ? "invite" : "reasons");
  };
  const toggleReason = (value: string) => setReasons((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const sendReasons = (skip: boolean) => {
    submitSurveyReasons(skip ? [] : reasons);
    setStep("invite");
  };
  const openForm = () => {
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
          <div><h2 id={titleId}>這次有找到你要的垃圾車時間嗎？</h2><p>一個問題就好，幫我們知道查詢好不好用。</p></div>
          <button type="button" className="survey-prompt-close" aria-label="關閉" onClick={() => dismissSurvey(step)}>×</button>
        </div>
        <div className="survey-prompt-actions">
          <button type="button" className="is-primary" onClick={() => choose("found")}>有，找到了</button>
          <button type="button" onClick={() => choose("not_found")}>沒有</button>
        </div>
        <p className="survey-prompt-fine">只記錄你的選擇與這條路線，不記錄位置。14 天內不會再問。</p>
      </>}
      {step === "reasons" && <>
        <div className="survey-prompt-head">
          <div><h2 id={titleId}>哪裡找不到？</h2><p>可以多選，點完按送出。</p></div>
          <button type="button" className="survey-prompt-close" aria-label="關閉" onClick={() => dismissSurvey(step)}>×</button>
        </div>
        <div className="survey-prompt-chips" role="group" aria-label="找不到的原因">
          {REASONS.map((reason) => <button key={reason.value} type="button" className={reasons.includes(reason.value) ? "is-on" : ""} aria-pressed={reasons.includes(reason.value)} onClick={() => toggleReason(reason.value)}>{reason.label}</button>)}
        </div>
        <div className="survey-prompt-actions">
          <button type="button" className="is-primary" onClick={() => sendReasons(false)}>送出</button>
          <button type="button" className="is-compact" onClick={() => sendReasons(true)}>略過</button>
        </div>
      </>}
      {step === "invite" && <>
        <div className="survey-prompt-head">
          <div>
            <p className="survey-prompt-thanks"><span aria-hidden="true">✓</span>謝謝，已記下。</p>
            <h2 id={titleId}>願意多說一點嗎？</h2>
            <p>{formUrl ? "3 題、約 1 分鐘，會在新分頁開啟 Tally 問卷。" : ""}你剛才的回答已經送出，不填也沒關係。</p>
          </div>
          <button type="button" className="survey-prompt-close" aria-label="關閉" onClick={() => dismissSurvey(step)}>×</button>
        </div>
        <div className="survey-prompt-actions">
          {formUrl && <button type="button" className="is-primary" onClick={openForm}>填 1 分鐘問卷 →</button>}
          <button type="button" className={formUrl ? "is-compact" : "is-primary"} onClick={() => declineSurveyForm(outcome)}>{formUrl ? "不用了" : "完成"}</button>
        </div>
      </>}
    </div>
  </dialog>;
}
