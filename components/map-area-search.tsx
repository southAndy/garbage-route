"use client";

import { useEffect, useRef, useState } from "react";
import type { CityCode } from "@/lib/types";
import type { SearchArea } from "@/lib/search-area";
import { CITY_NAMES } from "@/lib/paths";
import { trackMapPicker } from "@/lib/map-picker-analytics";

export default function MapAreaSearch({ city, district, initialQuery, disabled, onArea }: { city: CityCode; district: string; initialQuery: string; disabled: boolean; onArea: (area: SearchArea) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [city, district]);
  const search = async () => {
    if (disabled || busy || !district || query.trim().length < 2) return;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage("");
    trackMapPicker({ name: "map_area_search_clicked" });
    try {
      const response = await fetch("/api/v1/search-area", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, district, query }), signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "無法縮小範圍，請稍後再試。");
      if (controller.signal.aborted) return;
      if (!result.data) {
        trackMapPicker({ name: "map_area_search_result", status: "empty" });
        setMessage("此行政區沒有符合且可定位的站點，試試路名、巷弄或其他關鍵字。"); return;
      }
      const area = result.data as SearchArea;
      onArea(area);
      trackMapPicker({ name: "map_area_search_result", status: "success" });
      setMessage(`已移至「${area.query}」的 ${area.count} 處站點範圍。這不是門牌定位，請再調整十字位置。`);
    } catch (error) {
      if (!controller.signal.aborted) {
        trackMapPicker({ name: "map_area_search_result", status: "error" });
        setMessage(error instanceof Error ? error.message : "查詢失敗，仍可手動移動地圖。");
      }
    } finally {
      if (pending.current === controller) setBusy(false);
    }
  };
  return <form className="map-area-search" onSubmit={(event) => { event.preventDefault(); void search(); }}>
    <label htmlFor="map-area-keyword">用關鍵字縮小範圍 · {CITY_NAMES[city]}{district}</label>
    <div><input id="map-area-keyword" value={query} maxLength={160} disabled={disabled} placeholder="例如：景新街、景新街295巷" onChange={(event) => { pending.current?.abort(); setBusy(false); setMessage(""); setQuery(event.target.value); }} /><button type="submit" disabled={disabled || busy || !district || query.trim().length < 2}>{busy ? "查詢中…" : "縮小範圍"}</button></div>
    {!district && <p>請先取消選點，在搜尋面板選擇行政區。</p>}
    {message && <p role="status">{message}</p>}
  </form>;
}
