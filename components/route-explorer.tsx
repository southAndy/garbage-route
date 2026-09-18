"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CityCode, GarbageRoute, GarbageStop, RouteSummary } from "@/lib/types";
import { suspiciousStopIds, warningForStop } from "@/lib/route-display";
import { CITY_NAMES, cityPath, districtPath, routePath } from "@/lib/paths";
import SearchParamQuery from "./search-param-query";

const RouteMap = dynamic(() => import("./route-map"), { ssr: false, loading: () => <div className="map-loading"><span className="spinner" />正在準備地圖…</div> });
const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

type District = { name: string; slug: string; routeCount: number };

function scheduleText(days: boolean[]) {
  const active = days.map((enabled, index) => enabled ? DAY_NAMES[index] : null).filter(Boolean);
  return active.length ? active.map((day) => `週${day}`).join("、") : "未提供";
}

// Fixed time zone and numeric parts so build-time HTML (UTC on Vercel) matches what the browser renders.
const syncTimeFormatter = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

function formatSyncTime(value: string | null) {
  if (!value) return "未提供";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未提供" : syncTimeFormatter.format(date);
}

function displayTime(stop: GarbageStop, field: "arrivalTime" | "departureTime" = "arrivalTime") {
  const value = stop[field];
  if (!value) return "時間未提供";
  return `${value}${stop.serviceDayOffset ? "（次日）" : ""}`;
}

export default function RouteExplorer({
  initialRoute = null,
  initialCity = "TPE",
  initialDistrict = "",
  initialQuery = "",
  invalidSharedPath = false,
  syncQueryFromUrl = false,
  breadcrumb,
  children,
}: {
  initialRoute?: GarbageRoute | null;
  initialCity?: CityCode;
  initialDistrict?: string;
  initialQuery?: string;
  invalidSharedPath?: boolean;
  syncQueryFromUrl?: boolean;
  breadcrumb?: ReactNode;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [city, setCity] = useState<CityCode>(initialRoute?.cityCode ?? initialCity);
  const [districts, setDistricts] = useState<District[]>([]);
  const [district, setDistrict] = useState(initialRoute?.district ?? initialDistrict);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [route, setRoute] = useState<GarbageRoute | null>(initialRoute);
  const [selectedStop, setSelectedStop] = useState<GarbageStop | null>(initialRoute?.stops[0] ?? null);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [error, setError] = useState(invalidSharedPath ? "分享的路線已失效，請重新選擇路線。" : "");
  const [mapFailed, setMapFailed] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/districts?city=${city}`).then((res) => res.json()).then((result) => {
      if (!active) return;
      const next = result.data ?? [];
      setDistricts(next);
      if (!district || !next.some((item: District) => item.name === district)) setDistrict(next[0]?.name ?? "");
    }).catch(() => setError("行政區載入失敗，請稍後再試。"));
    return () => { active = false; };
  }, [city, district]);

  useEffect(() => {
    if (!district) return;
    let active = true;
    // The loading flag intentionally mirrors this request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingRoutes(true);
    const search = new URLSearchParams({ city, district, q: debouncedQuery });
    fetch(`/api/v1/routes?${search}`).then((res) => res.json()).then((result) => {
      if (active) setRoutes(result.data ?? []);
    }).catch(() => active && setError("路線載入失敗，請稍後再試。"))
      .finally(() => active && setLoadingRoutes(false));
    return () => { active = false; };
  }, [city, district, debouncedQuery]);

  const selectCity = (nextCity: CityCode) => {
    setCity(nextCity); setDistrict(""); setRoute(null); setSelectedStop(null); setQuery(""); setError("");
    router.replace(`/?city=${nextCity}`);
  };

  const selectDistrict = (nextDistrict: string) => {
    setDistrict(nextDistrict); setRoute(null); setSelectedStop(null); setError("");
    const params = new URLSearchParams({ city, district: nextDistrict });
    if (query) params.set("q", query);
    router.replace(`/?${params}`);
  };

  const selectRoute = async (summary: RouteSummary) => {
    setError("");
    try {
      const response = await fetch(`/api/v1/routes/${summary.id}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message);
      const detail = result.data as GarbageRoute;
      setRoute(detail);
      setSelectedStop(detail.stops[0] ?? null);
      setMobilePanelOpen(true);
      const search = new URLSearchParams();
      if (query) search.set("q", query);
      const suffix = search.size ? `?${search}` : "";
      router.push(`${routePath(detail)}${suffix}`);
    } catch {
      setError("找不到指定垃圾車路線，資料可能已更新。");
    }
  };

  const selectedIndex = route && selectedStop ? route.stops.findIndex((stop) => stop.id === selectedStop.id) : -1;
  const chooseStop = useCallback((stop: GarbageStop) => setSelectedStop(stop), []);
  const handleMapError = useCallback(() => setMapFailed(true), []);
  const validCount = useMemo(() => route?.stops.filter((stop) => stop.coordinateStatus === "valid").length ?? 0, [route]);
  const suspiciousIds = useMemo(() => suspiciousStopIds(route), [route]);
  const selectedWarning = useMemo(() => warningForStop(route, selectedStop), [route, selectedStop]);
  const warningCount = route?.coordinateWarnings?.length ?? 0;

  return (
    <main className="app-shell">
      {syncQueryFromUrl && <Suspense fallback={null}><SearchParamQuery onQuery={setQuery} /></Suspense>}
      <header className="app-header">
        <Link href="/" className="brand" aria-label="清運地圖首頁"><span className="brand-mark">清</span><span><strong>清運地圖</strong><small>雙北表定垃圾車路線</small></span></Link>
        <div className="header-note"><span className="status-dot" />非即時位置<span className="desktop-only">・依官方停靠順序繪製</span></div>
      </header>
      {breadcrumb}

      <section className="workspace">
        <aside className={`sidebar ${mobilePanelOpen ? "is-open" : ""}`} aria-label="路線查詢">
          <button className="sheet-handle" aria-label={mobilePanelOpen ? "收合路線面板" : "展開路線面板"} onClick={() => setMobilePanelOpen((open) => !open)}><span /></button>
          <div className="filters">
            <div className="step-label"><span>01</span> 選擇查詢範圍</div>
            <div className="city-tabs" aria-label="城市">
              {(Object.keys(CITY_NAMES) as CityCode[]).map((code) => <button key={code} className={city === code ? "active" : ""} aria-pressed={city === code} onClick={() => selectCity(code)}>{CITY_NAMES[code]}</button>)}
            </div>
            <label className="field-label" htmlFor="district">行政區</label>
            <div className="select-wrap"><select id="district" value={district} onChange={(event) => selectDistrict(event.target.value)}>{districts.map((item) => <option value={item.name} key={item.name}>{item.name}（{item.routeCount} 條）</option>)}</select></div>
            <label className="field-label" htmlFor="route-search">搜尋路線或停靠點</label>
            <div className="search-wrap"><span aria-hidden="true">⌕</span><input id="route-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：天母、安康路" /></div>
          </div>

          <div className="route-results">
            <div className="results-heading"><div className="step-label"><span>02</span> 選擇路線</div><small>{loadingRoutes ? "查詢中…" : `${routes.length} 條結果`}</small></div>
            {error && <div className="alert" role="alert">{error}</div>}
            {!loadingRoutes && routes.length === 0 ? <div className="empty-state"><span>沒有相符路線</span><p>試試其他關鍵字或行政區</p></div> : (
              <div className="route-list">
                {routes.map((item) => <Link key={item.id} href={routePath(item)} className={`route-card ${route?.id === item.id ? "selected" : ""}`} aria-current={route?.id === item.id ? "page" : undefined} onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); selectRoute(item); }}>
                  <span className="route-card-top"><strong>{item.routeName}{item.tripLabel ? `・${item.tripLabel}` : ""}</strong><i>›</i></span>
                  <span className="route-time">{item.firstArrivalTime ?? "--:--"}<em>—</em>{item.lastArrivalTime ?? "--:--"}</span>
                  <span className="route-meta">{item.startStopName ?? "起點未提供"} → {item.endStopName ?? "終點未提供"}</span>
                  <span className="route-count">共 {item.stopCount} 站</span>
                </Link>)}
              </div>
            )}
          </div>
        </aside>

        <section className="map-stage">
          {mapFailed ? <div className="map-fallback"><strong>地圖目前無法載入</strong><p>仍可從路線面板查看完整停靠點。</p><button onClick={() => { setMapFailed(false); window.location.reload(); }}>重新載入</button></div> : <RouteMap route={route} selectedStop={selectedStop} onSelectStop={chooseStop} onMapError={handleMapError} />}
          {!route && !invalidSharedPath && <div className="map-intro"><p className="eyebrow">TAIPEI · NEW TAIPEI</p><h1>今晚的垃圾車<br />會停在哪裡？</h1><p>選擇城市、行政區與路線，查看每一站的表定時間。</p><div className="intro-steps"><span><b>1</b>選城市</span><i>→</i><span><b>2</b>選行政區</span><i>→</i><span><b>3</b>看路線</span></div></div>}
          {route && validCount === 0 && <div className="map-warning">此路線暫無可用地圖位置，請查看文字停靠點列表。</div>}
          {route && warningCount > 0 && <div className="map-warning coordinate-review-warning" role="status">此路線有 {warningCount} 項位置待確認，橘色虛線為可疑區段。</div>}
          {route && <div className="route-badge">
            <span><Link href={cityPath(route.cityCode)}>{CITY_NAMES[route.cityCode]}</Link>・<Link href={districtPath(route.cityCode, route.districtSlug)}>{route.district}</Link></span>
            <h1>{route.routeName}{route.tripLabel ? `・${route.tripLabel}` : ""}</h1>
            <small>{route.firstArrivalTime} — {route.lastArrivalTime}・{route.stopCount} 站</small>
            <p className="route-summary">{route.routeName}{route.tripLabel ? `・${route.tripLabel}` : ""}位於{CITY_NAMES[route.cityCode]}{route.district}，表定時間 {route.firstArrivalTime ?? "未提供"} 至 {route.lastArrivalTime ?? "未提供"}，共 {route.stopCount} 個停靠點。</p>
          </div>}
          {selectedStop && route && <article className="stop-popup" aria-live="polite">
            <div className="popup-head"><span>第 {String(selectedStop.sequence).padStart(2, "0")} 站</span><button aria-label="關閉停靠點資訊" onClick={() => setSelectedStop(null)}>×</button></div>
            <time>{displayTime(selectedStop)}</time>
            <h2>{selectedStop.name}</h2>
            <p>{selectedStop.address || "地址未提供"}{selectedStop.village ? `・${selectedStop.village}` : ""}</p>
            {selectedStop.departureTime && <p className="detail-row">預定離開 <b>{displayTime(selectedStop, "departureTime")}</b></p>}
            {selectedStop.memo && <p className="memo">{selectedStop.memo}</p>}
            {selectedStop.schedule && <div className="schedule"><span>一般垃圾 <b>{scheduleText(selectedStop.schedule.garbage)}</b></span><span>資源回收 <b>{scheduleText(selectedStop.schedule.recycling)}</b></span><span>廚餘 <b>{scheduleText(selectedStop.schedule.foodScraps)}</b></span></div>}
            {selectedStop.coordinateStatus !== "valid" && <p className="coordinate-warning">此站座標無法定位</p>}
            {selectedWarning && <p className="coordinate-warning">官方座標可能有誤；橘色虛線為依原始座標繪製的待確認區段，請以地址文字為準。</p>}
            <div className="popup-nav"><button disabled={selectedIndex <= 0} onClick={() => setSelectedStop(route.stops[selectedIndex - 1])}>← 上一站</button><span>{selectedIndex + 1} / {route.stopCount}</span><button disabled={selectedIndex >= route.stops.length - 1} onClick={() => setSelectedStop(route.stops[selectedIndex + 1])}>下一站 →</button></div>
          </article>}
        </section>
      </section>

      {route && <section className="stops-section" aria-label="完整停靠點列表">
        <div className="stops-title"><div><p className="eyebrow">COMPLETE ROUTE</p><h2>完整停靠點</h2></div><p>路線線條依官方停靠點順序繪製，僅供路線範圍參考。</p></div>
        <div className="stops-track">
          {route.stops.map((stop, index) => <button key={stop.id} className={`stop-item ${selectedStop?.id === stop.id ? "selected" : ""} ${stop.coordinateStatus !== "valid" ? "invalid" : ""} ${suspiciousIds.has(stop.id) ? "suspicious" : ""}`} onClick={() => setSelectedStop(stop)} aria-pressed={selectedStop?.id === stop.id}>
            <span className="stop-sequence">{String(stop.sequence).padStart(2, "0")}</span><span className="track-line" aria-hidden="true" />
            <span className="stop-copy"><time>{displayTime(stop)}</time><strong>{stop.name}</strong><small>{stop.village || "里別未提供"}{stop.coordinateStatus !== "valid" ? "・無法定位" : suspiciousIds.has(stop.id) ? "・位置待確認" : ""}</small></span>
            {index === 0 && <em>起點</em>}{index === route.stops.length - 1 && <em className="end">終點</em>}
          </button>)}
        </div>
        <footer className="data-footer"><div><strong>{route.source.name}</strong><a href={route.source.url} target="_blank" rel="noreferrer">查看官方來源 ↗</a></div><div><span>官方更新 {formatSyncTime(route.source.sourceUpdatedAt)}</span><span>系統同步 {formatSyncTime(route.source.syncedAt)}</span></div>{route.source.stale && <p className="stale">目前顯示最後一次成功同步資料</p>}<p>本資料為表定時間，實際清運狀況可能不同。</p></footer>
      </section>}
      {children}
    </main>
  );
}
