"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PlaceCandidate } from "@/lib/place-search";

export default function PlaceSearch({ query, area, onPick, children }: { query: string; area: string; onPick: (place: PlaceCandidate) => void; children?: ReactNode }) {
  const [result, setResult] = useState<{ key: string; places: PlaceCandidate[]; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const key = `${area}|${query}`;
  useEffect(() => () => controller.current?.abort(), [key]);
  const search = async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/v1/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, area }), signal: current.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "地址查詢失敗，請改用地圖選點。");
      if (!current.signal.aborted) setResult({ key, places: data.data });
    } catch (error) {
      if (!current.signal.aborted) setResult({ key, places: [], error: error instanceof Error ? error.message : "地址查詢失敗" });
    } finally {
      if (controller.current === current) setBusy(false);
    }
  };
  const shown = result?.key === key ? result : null;
  return <div className="place-search">
    <div className="place-search-actions">
      <button type="button" disabled={busy || query.trim().length < 2} onClick={search}>{busy ? "查地址中…" : "查地址位置"}</button>
      {children}
    </div>
    <small>免開定位。查地址會將輸入文字送至 Photon，選好位置後比較站點直線距離。</small>
    {shown && <div aria-live="polite">
      {shown.error ? <p>{shown.error}</p> : shown.places.length === 0 ? <p>找不到地點。請改用「行政區＋地址」或在地圖選點。</p> : <>
        <p>選擇地點，再到地圖確認位置：</p>
        <ul>{shown.places.map((place, index) => <li key={index}><button type="button" onClick={() => onPick(place)}>{place.label}<small>{place.approximate ? "概略位置，請移動地圖確認門牌" : "在地圖確認位置"}</small></button></li>)}</ul>
      </>}
      <small>地點資料：<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · Photon</small>
    </div>}
  </div>;
}
