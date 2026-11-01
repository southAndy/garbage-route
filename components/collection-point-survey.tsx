"use client";

import { useEffect, useId, useRef } from "react";
import FeedbackButton from "./feedback-button";
import { feedbackUrls } from "@/lib/feedback";
import { COLLECTION_SURVEY_REASONS } from "@/lib/collection-survey-options";
import { CITY_NAMES } from "@/lib/paths";
import type { CollectionSurveyController } from "@/lib/use-collection-survey";

export default function CollectionPointSurvey({ survey }: { survey: CollectionSurveyController }) {
  const { prompt } = survey;
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(prompt?.step);
  useEffect(() => {
    // Only move focus after a person's answer changes the step, never on timed appearance.
    if (previousStep.current && previousStep.current !== prompt?.step) heading.current?.focus({ preventScroll: true });
    previousStep.current = prompt?.step;
  }, [prompt?.step]);
  if (!prompt) return null;
  const context = prompt.context;
  const feedbackAvailable = Boolean(feedbackUrls(process.env.NEXT_PUBLIC_TALLY_FORM_URL, { entry: "collection_points" }));
  return <section className="collection-survey" aria-labelledby={titleId}>
    <div className="collection-survey-head">
      <div><p className="collection-survey-eyebrow">幫我們改善查詢體驗</p>
        <h3 ref={heading} tabIndex={-1} id={titleId}>{prompt.step === "question" ? "這頁有幫助你找到收受地點與時間嗎？"
          : prompt.step === "reasons" ? prompt.outcome ? "主要遇到什麼問題？" : "這次沒找到的主要原因？"
          : feedbackAvailable ? "謝謝你的回饋，還有其他建議嗎？" : "謝謝你的回饋。"}</h3>
      </div>
      <button type="button" className="collection-survey-close" aria-label="關閉收受點問卷" onClick={survey.dismiss}>×</button>
    </div>
    {prompt.step === "question" && <div className="collection-survey-options">
      <button type="button" className="is-primary" onClick={() => survey.answer("found")}>有，找到了</button>
      <button type="button" onClick={() => survey.answer("not_found")}>查了，但沒找到</button>
      <button type="button" onClick={() => survey.answer("in_progress")}>還在找</button>
    </div>}
    {prompt.step === "reasons" && <>
      <div className="collection-survey-options" role="group" aria-label="收受點查詢未成功的原因">
        {COLLECTION_SURVEY_REASONS.map((reason) => <button key={reason.value} type="button" aria-pressed={prompt.reason === reason.value} onClick={() => survey.chooseReason(reason.value)}>{reason.label}</button>)}
      </div>
      <button type="button" className="collection-survey-text-button" onClick={() => prompt.outcome ? survey.chooseReason(null) : survey.dismiss()}>{prompt.outcome ? "略過原因" : "先繼續查詢"}</button>
    </>}
    {prompt.step === "invite" && <>
      {feedbackAvailable && <p className="collection-survey-note">有想法再補充即可，將開啟網站現有的回饋表單。</p>}
      {prompt.outcome === "not_found" && <button type="button" className="collection-survey-text-button" onClick={survey.editReason}>改選原因</button>}
      <div className="collection-survey-actions">
        <FeedbackButton label="補充建議（選填）" dialogTitle="收受點查詢建議" onOpen={survey.formOpened}
          context={{ entry: "collection_points", ...context, outcome: prompt.outcome ?? undefined }}
          summary={`${CITY_NAMES[context.city]}${context.district ? `・${context.district}` : "・全部行政區"}・${context.view_mode === "map" ? "地圖" : "列表"}`} />
        <button type="button" onClick={survey.dismiss}>繼續查詢</button>
      </div>
    </>}
    <p className="collection-survey-fine">只記錄查詢情境與回答，不記錄定位座標。回答或關閉後，14 天內不再詢問。</p>
  </section>;
}
