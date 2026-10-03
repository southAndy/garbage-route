"use client";

import { useEffect, useId, useRef, useState } from "react";
import { feedbackUrls, type FeedbackContext } from "@/lib/feedback";

export default function FeedbackButton({
  context = { entry: "general" }, label = "意見回饋", summary,
}: { context?: FeedbackContext; label?: string; summary?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [opened, setOpened] = useState(false);
  const [activeForm, setActiveForm] = useState<{ share: string; embed: string; summary?: string } | null>(null);
  const urls = feedbackUrls(process.env.NEXT_PUBLIC_TALLY_FORM_URL, context);

  useEffect(() => {
    if (!opened) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [opened]);

  if (!urls) return null;
  return <>
    <button className="feedback-button" type="button" onClick={() => {
      setActiveForm({ ...urls, summary });
      dialog.current?.showModal();
      closeButton.current?.focus({ preventScroll: true });
      setOpened(true);
    }}>{label}</button>
    <dialog className="feedback-dialog" ref={dialog} aria-labelledby={titleId} onClose={() => setOpened(false)}>
      <div className="feedback-dialog-head">
        <h2 id={titleId}>{label}</h2>
        <button type="button" ref={closeButton} className="feedback-close" aria-label="關閉回饋表單" onClick={() => dialog.current?.close()}>×</button>
      </div>
      {activeForm?.summary && <p className="feedback-context">{activeForm.summary}</p>}
      <p className="feedback-note">協助我們改善查詢體驗與核對資料；此處不受理即時清運服務要求。表單由 Tally 提供。</p>
      {activeForm && <>
        <iframe className="feedback-frame" src={activeForm.embed} title={`${label}表單`} />
        <p className="feedback-note">表單未顯示？<a href={activeForm.share} target="_blank" rel="noreferrer">在新分頁開啟表單 ↗</a></p>
      </>}
    </dialog>
  </>;
}
