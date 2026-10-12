"use client";

import { usePathname } from "next/navigation";
import { feedbackUrls } from "@/lib/feedback";
import FeedbackButton from "./feedback-button";

export default function MobileSurveyInvite() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  if (!feedbackUrls(process.env.NEXT_PUBLIC_TALLY_FORM_URL, { entry: "general" })) return null;

  return <aside className="mobile-survey-invite" aria-label="查詢體驗問卷">
    <div>
      <strong>這次查詢有幫助嗎？</strong>
      <p>分享體驗，幫我們改善查詢</p>
    </div>
    <FeedbackButton label="填寫問卷" dialogTitle="分享你的查詢體驗" />
  </aside>;
}
