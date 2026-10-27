"use client";

import { track } from "@vercel/analytics";
import { useEffect, useRef } from "react";
import { AD_SLOT_SIZES, getAdsMode, type AdSlotId } from "@/lib/ads";

const SLOT_LABELS: Record<AdSlotId, string> = {
  route_stops: "路線頁・站點列表下方",
  district_list: "行政區頁・路線列表下方",
  collection_points: "限時收受點頁・查詢結果下方",
};

/**
 * A fixed-height ad frame. In `placeholder` mode it draws a labelled box of the real unit's size and
 * records `ad_slot_viewed` once the frame is at least half visible. In `measure` mode it renders an
 * invisible zero-height sentinel and records the same event once the sentinel scrolls into view, so
 * production can learn how many visitors reach each candidate position without showing anything.
 * In `off` mode nothing renders.
 */
export default function AdSlot({ slot }: { slot: AdSlotId }) {
  const mode = getAdsMode();
  const frameRef = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") return;
    // A zero-area sentinel reports a ratio of 0 or 1 only, so the measure mode keys off isIntersecting alone.
    const minRatio = mode === "measure" ? 0 : 0.5;
    const observer = new IntersectionObserver((entries) => {
      if (viewed.current || !entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= minRatio)) return;
      viewed.current = true;
      try { track("ad_slot_viewed", { slot, mode }); } catch { /* Tracking is optional. */ }
      observer.disconnect();
    }, { threshold: minRatio });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [slot, mode]);

  if (mode === "off") return null;
  if (mode === "measure") return <div ref={frameRef} className="ad-slot-sentinel" data-slot={slot} aria-hidden="true" />;

  const { mobile, desktop } = AD_SLOT_SIZES;
  return <aside className="ad-slot" aria-label="廣告">
    <span className="ad-slot-tag">廣告</span>
    <div ref={frameRef} className="ad-slot-frame ad-slot-placeholder" data-slot={slot}>
      <strong>廣告位預覽</strong>
      <span>{SLOT_LABELS[slot]}</span>
      <small>手機 {mobile.width}×{mobile.height}・桌機 {desktop.width}×{desktop.height}</small>
    </div>
  </aside>;
}
