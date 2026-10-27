"use client";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { CITY_NAMES } from "@/lib/paths";
import type { LocationSuggestion } from "@/lib/location-suggestions";

const EMPTY_ITEMS: LocationSuggestion[] = [];

export default function LocationSearch({ query, onQuery, onSelect, inputRef }: { query: string; onQuery: (query: string) => void; onSelect: (item: LocationSuggestion) => void; inputRef: RefObject<HTMLInputElement | null> }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [result, setResult] = useState<{ query: string; items: LocationSuggestion[]; error?: boolean } | null>(null);
  const id = useId();
  const activeOption = useRef<HTMLLIElement>(null);
  const items = result?.query === query ? result.items : EMPTY_ITEMS;
  const expanded = open && Boolean(query.trim());
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/v1/location-suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const data = await response.json();
        if (!controller.signal.aborted) setResult({ query, items: data.data });
      } catch { if (!controller.signal.aborted) setResult({ query, items: [], error: true }); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, expanded]);
  const at = Math.min(active, items.length - 1);
  useEffect(() => { if (expanded) activeOption.current?.scrollIntoView?.({ block: "nearest" }); }, [expanded, at, items]);
  const choose = (item: LocationSuggestion) => { setOpen(false); onSelect(item); };
  return <div className="district-combobox location-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <input ref={inputRef} id="route-search" role="combobox" aria-label="搜尋雙北路名、地址或站點" aria-expanded={expanded} aria-autocomplete="list" aria-controls={expanded ? id : undefined} aria-activedescendant={expanded && at >= 0 ? `${id}-${at}` : undefined} autoComplete="off" maxLength={160} placeholder="輸入路名或地址，例如：景新街" value={query} onFocus={() => { setOpen(true); setActive(0); }} onChange={(event) => { setOpen(true); setActive(0); onQuery(event.target.value); }} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(Math.max(0, Math.min(items.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter") { event.preventDefault(); if (expanded && items[at]) choose(items[at]); else setOpen(true); }
    }} />
    {query && <button type="button" className="district-toggle" aria-label="清除搜尋" onMouseDown={(event) => event.preventDefault()} onClick={() => { onQuery(""); setActive(0); inputRef.current?.focus(); }}>×</button>}
    {expanded && <div className="district-dropdown">
      <ul id={id} role="listbox" aria-label="雙北地點搜尋結果">{items.map((item, index) => <li key={`${item.city}|${item.district}|${item.name}`} id={`${id}-${index}`} role="option" aria-selected={index === at} ref={index === at ? activeOption : undefined} className={index === at ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}><span>{CITY_NAMES[item.city]}・{item.district}・{item.name}</span></li>)}</ul>
      {items.length === 0 && <p role="status">{result?.query !== query ? "搜尋雙北地點中…" : result.error ? "搜尋暫時失敗，請修改關鍵字重試。" : "站點資料中沒有相符地點，請試試其他路名或地址。"}</p>}
      {items.length === 30 && <p>還有其他地點，請輸入更完整的路名或行政區。</p>}
    </div>}
  </div>;
}
