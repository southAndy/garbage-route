"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CityCode, GarbageRoute, GarbageStop, RouteSummary } from "@/lib/types";
import { suspiciousStopIds, warningForStop } from "@/lib/route-display";
import { CITY_NAMES, cityPath, districtPath, routePath } from "@/lib/paths";
import SearchParamQuery from "./search-param-query";
import StopOutcomeFeedback from "./stop-outcome-feedback";
import StopScheduleTable from "./stop-schedule-table";
import SiteHeader from "./site-header";
import FeedbackButton from "./feedback-button";
import { displayTime, scheduleText } from "@/lib/schedule-display";

const RouteMap = dynamic(() => import("./route-map"), { ssr: false, loading: () => <div className="map-loading"><span className="spinner" />正在準備地圖…</div> });

const mobileQuery = "(max-width: 760px)";
function subscribeToViewport(onChange: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function getMobileSnapshot() { return window.matchMedia(mobileQuery).matches; }
function getServerMobileSnapshot() { return false; }

type District = { name: string; slug: string; routeCount: number };

// Taipei time assembled by hand (no Intl) so build-time HTML and the browser produce byte-identical text.
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatSyncTime(value: string | null) {
  if (!value) return "未提供";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "未提供";
  const local = new Date(timestamp + TAIPEI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local.getUTCFullYear()}/${pad(local.getUTCMonth() + 1)}/${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
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
  const isMobile = useSyncExternalStore(subscribeToViewport, getMobileSnapshot, getServerMobileSnapshot);
  const mapStageRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [city, setCity] = useState<CityCode>(initialRoute?.cityCode ?? initialCity);
  const [districts, setDistricts] = useState<District[]>([]);
  const [district, setDistrict] = useState(initialRoute?.district ?? initialDistrict);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [route, setRoute] = useState<GarbageRoute | null>(initialRoute);
  const [selectedStop, setSelectedStop] = useState<GarbageStop | null>(initialRoute?.stops[0] ?? null);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [error, setError] = useState(invalidSharedPath ? "分享的路線已失效，請重新選擇路線。" : "");
  const [mobileStopOpen, setMobileStopOpen] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  // Once a route is chosen the mobile sheet collapses so the map and stop popup stay visible.
  const [mobilePanelOpen, setMobilePanelOpen] = useState(!initialRoute);

  useEffect(() => {
    if (!isMobile || !mobilePanelOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || sidebarRef.current?.contains(target)) return;
      // Native modal dialogs render outside the sidebar visually; let their controls work.
      if (target.closest("dialog[open]")) return;
      setMobilePanelOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isMobile, mobilePanelOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/districts?city=${city}`).then((res) => {
      if (!res.ok) throw new Error("District request failed");
      return res.json();
    }).then((result) => {
      if (!active) return;
      const next = result.data ?? [];
      setDistricts(next);
      if (!district || !next.some((item: District) => item.name === district)) setDistrict(next[0]?.name ?? "");
      if (next.length === 0) setLoadingRoutes(false);
    }).catch(() => {
      if (!active) return;
      setError("行政區載入失敗，請稍後再試。");
      if (!district) setLoadingRoutes(false);
    });
    return () => { active = false; };
  }, [city, district]);

  useEffect(() => {
    if (!district) return;
    let active = true;
    // The loading flag intentionally mirrors this request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingRoutes(true);
    const search = new URLSearchParams({ city, district, q: debouncedQuery });
    fetch(`/api/v1/routes?${search}`).then((res) => {
      if (!res.ok) throw new Error("Routes request failed");
      return res.json();
    }).then((result) => {
      if (active) setRoutes(result.data ?? []);
    }).catch(() => active && setError("路線載入失敗，請稍後再試。"))
      .finally(() => active && setLoadingRoutes(false));
    return () => { active = false; };
  }, [city, district, debouncedQuery]);

  const selectCity = (nextCity: CityCode) => {
    if (nextCity === city) return;
    setLoadingRoutes(true); setRoutes([]); setDistricts([]);
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
      setMobileStopOpen(false);
      setMobilePanelOpen(false);
      const search = new URLSearchParams();
      if (query) search.set("q", query);
      const suffix = search.size ? `?${search}` : "";
      router.push(`${routePath(detail)}${suffix}`);
    } catch {
      setError("找不到指定垃圾車路線，資料可能已更新。");
    }
  };

  const selectedIndex = route && selectedStop ? route.stops.findIndex((stop) => stop.id === selectedStop.id) : -1;
  const chooseStop = useCallback((stop: GarbageStop) => {
    setSelectedStop(stop);
    setMobileStopOpen(true);
  }, []);
  const viewStopOnMap = useCallback((stop: GarbageStop) => {
    setSelectedStop(stop);
    setMobileStopOpen(true);
    setMobilePanelOpen(false);
    mapStageRef.current?.focus({ preventScroll: true });
    mapStageRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, []);
  const openRouteSearch = () => {
    // Mount the mobile input before focusing it, within the user's click.
    flushSync(() => setMobilePanelOpen(true));
    searchInputRef.current?.focus({ preventScroll: true });
    searchInputRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    searchInputRef.current?.select();
  };
  const handleMapError = useCallback(() => setMapFailed(true), []);
  const validCount = useMemo(() => route?.stops.filter((stop) => stop.coordinateStatus === "valid").length ?? 0, [route]);
  const suspiciousIds = useMemo(() => suspiciousStopIds(route), [route]);
  const selectedWarning = useMemo(() => warningForStop(route, selectedStop), [route, selectedStop]);
  const warningCount = route?.coordinateWarnings?.length ?? 0;

  return (
    <main className="app-shell">
      {syncQueryFromUrl && <Suspense fallback={null}><SearchParamQuery onQuery={setQuery} /></Suspense>}
      <SiteHeader />
      {breadcrumb}

      <section className="workspace">
        <aside ref={sidebarRef} className={`sidebar ${mobilePanelOpen ? "is-open" : ""}`} aria-label="路線查詢">
          <button className="sheet-handle" aria-expanded={mobilePanelOpen} aria-controls="route-search-panel" onClick={() => setMobilePanelOpen((open) => !open)}>
            <span className="sheet-grip" aria-hidden="true" />
            <span className="sheet-label"><strong>{district || CITY_NAMES[city]}</strong><span>{mobilePanelOpen ? "收合路線搜尋" : "搜尋其他路線"}</span><span aria-hidden="true">{mobilePanelOpen ? "⌄" : "⌃"}</span></span>
          </button>
          <div id="route-search-panel" className="search-panel-content" hidden={isMobile && !mobilePanelOpen}>
          {(!isMobile || mobilePanelOpen) && <>
          <div className="filters">
            <div className="step-label"><span>01</span> 選擇查詢範圍</div>
            <div className="city-tabs" aria-label="城市">
              {(Object.keys(CITY_NAMES) as CityCode[]).map((code) => <button key={code} className={city === code ? "active" : ""} aria-pressed={city === code} onClick={() => selectCity(code)}>{CITY_NAMES[code]}</button>)}
            </div>
            <label className="field-label" htmlFor="district">行政區</label>
            <div className="select-wrap"><select id="district" value={district} onChange={(event) => selectDistrict(event.target.value)}>{districts.map((item) => <option value={item.name} key={item.name}>{item.name}（{item.routeCount} 條）</option>)}</select></div>
            <label className="field-label route-search-label" htmlFor="route-search">搜尋{district || CITY_NAMES[city]}的路名或停靠點</label>
            <div className="search-wrap"><span aria-hidden="true">⌕</span><input ref={searchInputRef} id="route-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={district === "士林區" ? "例如：延平北路、社子" : "輸入路名、地點或路線名稱"} /></div>
          </div>

          <div className="route-results">
            <div className="results-heading"><div className="step-label"><span>02</span> 選擇路線</div><small>{loadingRoutes ? "查詢中…" : `${routes.length} 條結果`}</small></div>
            {error && <div className="alert" role="alert">{error}</div>}
            {loadingRoutes ? <div className="routes-loading" role="status"><span className="spinner" aria-hidden="true" /><span>正在載入路線資料…</span></div> : routes.length === 0 ? !error && <div className="empty-state"><span>沒有相符路線</span><p>試試其他關鍵字或行政區</p>{district && <FeedbackButton label="找不到要找的地點？告訴我們" context={{ entry: "empty_search", city, district, query: debouncedQuery }} summary={`${CITY_NAMES[city]}・${district}${debouncedQuery ? `・搜尋：${debouncedQuery}` : ""}`} />}</div> : (
              <div className="route-list">
                {routes.map((item) => <Link key={item.id} href={routePath(item)} className={`route-card ${route?.id === item.id ? "selected" : ""}`} aria-current={route?.id === item.id ? "page" : undefined} onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); selectRoute(item); }}>
                  <span className="route-card-top"><strong>{item.routeName}{item.tripLabel ? `・${item.tripLabel}` : ""}</strong><i>›</i></span>
                  <span className="route-time">{item.firstArrivalTime ?? "--:--"}<em>—</em>{item.lastArrivalTime ?? "--:--"}</span>
                  <span className="route-card-bottom">
                    <span className="route-meta">{item.startStopName ?? "起點未提供"} → {item.endStopName ?? "終點未提供"}</span>
                    <span className="route-count">共 {item.stopCount} 站</span>
                  </span>
                </Link>)}
              </div>
            )}
          </div>
          </>}
          </div>
        </aside>

        <section className="map-stage" ref={mapStageRef} tabIndex={-1} aria-label="路線地圖與所選停靠點">
          {mapFailed ? <div className="map-fallback"><strong>地圖目前無法載入</strong><p>仍可從路線面板查看完整停靠點。</p><button onClick={() => { setMapFailed(false); window.location.reload(); }}>重新載入</button></div> : <RouteMap route={route} selectedStop={selectedStop} onSelectStop={chooseStop} onMapError={handleMapError} />}
          {!route && !invalidSharedPath && <div className="map-intro"><p className="eyebrow">TAIPEI · NEW TAIPEI</p><h1>台北、新北<br />垃圾車時間與路線查詢</h1><p>今晚的垃圾車會停在哪裡？<br />選擇城市、行政區與路線，查看每一站的表定時間。</p><div className="intro-steps"><span><b>1</b>選城市</span><i>→</i><span><b>2</b>選行政區</span><i>→</i><span><b>3</b>看路線</span></div></div>}
          {route && validCount === 0 && <div className="map-warning">此路線暫無可用地圖位置，請查看文字停靠點列表。</div>}
          {route && warningCount > 0 && <div className="map-warning coordinate-review-warning" role="status">此路線有 {warningCount} 項位置待確認，橘色虛線為可疑區段。</div>}
          {route && <div className="route-badge">
            <span><Link href={cityPath(route.cityCode)}>{CITY_NAMES[route.cityCode]}</Link>・<Link href={districtPath(route.cityCode, route.districtSlug)}>{route.district}</Link></span>
            <h1>{route.routeName}{route.tripLabel ? `・${route.tripLabel}` : ""}</h1>
            <small>全線表定 {route.firstArrivalTime ?? "--:--"} — {route.lastArrivalTime ?? "--:--"}・{route.stopCount} 站</small>
            <p className="route-summary">{route.routeName}{route.tripLabel ? `・${route.tripLabel}` : ""}位於{CITY_NAMES[route.cityCode]}{route.district}，表定時間 {route.firstArrivalTime ?? "未提供"} 至 {route.lastArrivalTime ?? "未提供"}，共 {route.stopCount} 個停靠點。</p>
            <a className="view-stops-button" href="#route-stops">查看全部站點與時間 ↓</a>
            <div className="route-search-shortcut"><span>不是你要找的路線？</span><button type="button" onClick={openRouteSearch} aria-controls="route-search-panel">搜尋其他地點</button></div>
          </div>}
          {selectedStop && route && <article className={`stop-popup ${mobileStopOpen ? "mobile-stop-open" : ""}`} aria-live="polite">
            <div className="popup-head"><span>第 {String(selectedStop.sequence).padStart(2, "0")} 站・表定抵達</span><button aria-label="關閉停靠點資訊" onClick={() => setSelectedStop(null)}>×</button></div>
            <time>{displayTime(selectedStop)}</time>
            <h2>{selectedStop.name}</h2>
            <a className="mobile-stop-details-link" href={`#stop-details-${selectedStop.id}`} onClick={(event) => {
              event.preventDefault();
              const target = document.getElementById(`stop-details-${selectedStop.id}`);
              if (target instanceof HTMLDetailsElement) target.open = true;
              target?.querySelector("summary")?.focus({ preventScroll: true });
              target?.scrollIntoView({ block: "start", behavior: "auto" });
            }}>查看此站完整資訊 ↓</a>
            <div className="mobile-popup-feedback">
              <FeedbackButton label="回報此站問題" context={{ entry: "stop", city: route.cityCode, district: route.district, route_id: route.id, stop_id: selectedStop.id, source_synced_at: route.source.syncedAt }} summary={`${CITY_NAMES[route.cityCode]}・${route.district}・${route.routeName}・第 ${selectedStop.sequence} 站 ${selectedStop.name}`} />
            </div>
            <div className="desktop-stop-details">
            <p>{selectedStop.address || "地址未提供"}{selectedStop.village ? `・${selectedStop.village}` : ""}</p>
            {selectedStop.departureTime && <p className="detail-row">預定離開 <b>{displayTime(selectedStop, "departureTime")}</b></p>}
            {selectedStop.memo && <p className="memo">{selectedStop.memo}</p>}
            {selectedStop.schedule && <div className="schedule"><span>一般垃圾 <b>{scheduleText(selectedStop.schedule.garbage)}</b></span><span>資源回收 <b>{scheduleText(selectedStop.schedule.recycling)}</b></span><span>廚餘 <b>{scheduleText(selectedStop.schedule.foodScraps)}</b></span></div>}
            {selectedStop.coordinateStatus !== "valid" && <p className="coordinate-warning">此站座標無法定位</p>}
            {selectedWarning && <p className="coordinate-warning">官方座標可能有誤；橘色虛線為依原始座標繪製的待確認區段，請以地址文字為準。</p>}
            <FeedbackButton label="回報此站資訊" context={{ entry: "stop", city: route.cityCode, district: route.district, route_id: route.id, stop_id: selectedStop.id, source_synced_at: route.source.syncedAt }} summary={`${CITY_NAMES[route.cityCode]}・${route.district}・${route.routeName}・第 ${selectedStop.sequence} 站 ${selectedStop.name}`} />
            <div className="popup-nav"><button disabled={selectedIndex <= 0} onClick={() => setSelectedStop(route.stops[selectedIndex - 1])}>← 上一站</button><span>{selectedIndex + 1} / {route.stopCount}</span><button disabled={selectedIndex >= route.stops.length - 1} onClick={() => setSelectedStop(route.stops[selectedIndex + 1])}>下一站 →</button></div>
            </div>
          </article>}
        </section>
      </section>

      {route && <section id="route-stops" className="stops-section" tabIndex={-1} aria-label="完整停靠點列表">
        <div className="stops-title"><div><p className="eyebrow">COMPLETE ROUTE</p><h2>完整停靠點</h2></div><p>路線線條依官方停靠點順序繪製，僅供路線範圍參考。</p></div>
        <div className="stops-track">
          {route.stops.map((stop, index) => <button key={stop.id} className={`stop-item ${selectedStop?.id === stop.id ? "selected" : ""} ${stop.coordinateStatus !== "valid" ? "invalid" : ""} ${suspiciousIds.has(stop.id) ? "suspicious" : ""}`} onClick={() => viewStopOnMap(stop)} aria-label={`在地圖查看第 ${stop.sequence} 站 ${stop.name}`} aria-pressed={selectedStop?.id === stop.id}>
            <span className="stop-sequence">{String(stop.sequence).padStart(2, "0")}</span><span className="track-line" aria-hidden="true" />
            <span className="stop-copy"><time>{displayTime(stop)}</time><strong>{stop.name}</strong><span className="stop-map-link">在地圖查看 ↗</span><small>{stop.village || "里別未提供"}{stop.coordinateStatus !== "valid" ? "・無法定位" : suspiciousIds.has(stop.id) ? "・位置待確認" : ""}</small></span>
            {index === 0 && <em>起點</em>}{index === route.stops.length - 1 && <em className="end">終點</em>}
          </button>)}
        </div>
        <div className="mobile-stop-list">
          <p className="mobile-schedule-note">以下為表定資訊；假日或臨時調整請以清潔隊公告為準。</p>
          {route.stops.map((stop) => <details key={stop.id} id={`stop-details-${stop.id}`} className="mobile-stop-card">
            <summary className="mobile-stop-summary">
              <span className="mobile-stop-number">第 {stop.sequence} 站</span>
              <strong className="mobile-stop-name">{stop.name}</strong>
              <span className="mobile-stop-arrival">表定抵達 <b>{displayTime(stop)}</b></span>
              <span className="mobile-stop-toggle" aria-hidden="true"><span className="when-closed">展開 ⌄</span><span className="when-open">收合 ⌃</span></span>
            </summary>
            <p>{stop.address || "地址未提供"}{stop.village ? `・${stop.village}` : ""}</p>
            <dl className="mobile-stop-schedule">
              <div><dt>表定抵達</dt><dd>{displayTime(stop)}</dd></div>
              <div><dt>表定離開</dt><dd>{displayTime(stop, "departureTime")}</dd></div>
              <div><dt>一般垃圾</dt><dd>{scheduleText(stop.schedule?.garbage)}</dd></div>
              <div><dt>資源回收</dt><dd>{scheduleText(stop.schedule?.recycling)}</dd></div>
              <div><dt>廚餘</dt><dd>{scheduleText(stop.schedule?.foodScraps)}</dd></div>
            </dl>
            {stop.memo && <p className="memo">{stop.memo}</p>}
            {stop.coordinateStatus !== "valid" && <p className="coordinate-warning">此站座標無法定位，請以地址文字為準。</p>}
            {suspiciousIds.has(stop.id) && <p className="coordinate-warning">官方座標可能有誤，請以地址文字為準。</p>}
            <div className="mobile-stop-actions">
              <button type="button" onClick={() => viewStopOnMap(stop)}>在地圖查看 ↗</button>
              <FeedbackButton label="回報此站資訊" context={{ entry: "stop", city: route.cityCode, district: route.district, route_id: route.id, stop_id: stop.id, source_synced_at: route.source.syncedAt }} summary={`${CITY_NAMES[route.cityCode]}・${route.district}・${route.routeName}・第 ${stop.sequence} 站 ${stop.name}`} />
            </div>
            <StopOutcomeFeedback context={{ city: route.cityCode, district: route.district, route_id: route.id, stop_id: stop.id, source_synced_at: route.source.syncedAt }} summary={`${CITY_NAMES[route.cityCode]}・${route.district}・${route.routeName}・第 ${stop.sequence} 站 ${stop.name}`} />
          </details>)}
        </div>
        <div className="desktop-stop-table"><StopScheduleTable stops={route.stops} onSelectStop={viewStopOnMap} /></div>
        <footer className="data-footer"><div><strong>{route.source.name}</strong><a href={route.source.url} target="_blank" rel="noreferrer">查看官方來源 ↗</a></div><div><span>官方更新 {formatSyncTime(route.source.sourceUpdatedAt)}</span><span>資料同步 {formatSyncTime(route.source.syncedAt)}</span><span>最後成功檢查 {formatSyncTime(route.source.lastCheckedAt ?? route.source.syncedAt)}</span></div>{route.source.stale && <p className="stale">目前顯示最後一次成功同步資料</p>}<p>本資料為表定時間，實際清運狀況可能不同。</p></footer>
      </section>}
      {children}
    </main>
  );
}
