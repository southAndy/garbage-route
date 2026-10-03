"use client";

import { useId } from "react";
import FeedbackButton from "./feedback-button";
import { feedbackUrls, type FeedbackContext } from "@/lib/feedback";

type Props = {
  context: Omit<FeedbackContext, "entry" | "outcome">;
  summary: string;
};

export default function StopOutcomeFeedback({ context, summary }: Props) {
  const questionId = useId();
  const baseContext: FeedbackContext = { ...context, entry: "stop_outcome" };
  if (!feedbackUrls(process.env.NEXT_PUBLIC_TALLY_FORM_URL, baseContext)) return null;

  return <div className="stop-outcome-feedback" role="group" aria-labelledby={questionId}>
    <p id={questionId} className="stop-outcome-question">這個站點資訊有幫助你找到倒垃圾的地點與時間嗎？</p>
    <p>選擇後開啟回饋表單，送出才會記錄回答。</p>
    <div className="stop-outcome-options">
      <FeedbackButton label="有找到" dialogTitle="有找到：分享查詢回饋" context={{ ...baseContext, outcome: "found" }} summary={`${summary}・回答：有找到`} />
      <FeedbackButton label="還沒找到" dialogTitle="還沒找到：告訴我們遇到的問題" context={{ ...baseContext, outcome: "not_found" }} summary={`${summary}・回答：還沒找到`} />
    </div>
  </div>;
}
