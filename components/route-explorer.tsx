"use client";

import TrackedLocationButton from "./tracked-location-button";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
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
import { formatDistance, GEOLOCATION_OPTIONS, locateErrorState, locateMessage, queryGeolocationPermission, roundForRequest, type GeolocationPermission, type LocateState } from "@/lib/geolocation";
import type { NearbyResult, NearbyRoute } from "@/lib/nearby-search";
import NearbyRouteCard from "./nearby-route-card";
import { closestUpcomingRouteId, partitionNearbyRoutes, taipeiClock, type NearbySort } from "@/lib/stop-timing";
import { readNearbySort, writeNearbySort } from "@/lib/nearby-sort";
import { track } from "@vercel/analytics";
import { ACCURACY_WARNING_METERS, clearLocationSession, clearPendingStopFocus, getLocationSession, peekPendingStopFocus, setLocationSession, setPendingStopFocus, useLocationSession } from "@/lib/user-location";

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
  const [loadingDistricts, setLoadingDistricts] = useState(true);
  const [districtsFailed, setDistrictsFailed] = useState(false);
  const [district, setDistrict] = useState(initialRoute?.district ?? initialDistrict);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [route, setRoute] = useState<GarbageRoute | null>(initialRoute);
  // A focus set by selectRoute just before navigating here (see lib/user-location.ts); peeked, not
  // consumed, so Strict Mode's double initializer call sees the same value. Cleared after mount.
  const [initialFocus] = useState(() => initialRoute ? peekPendingStopFocus(initialRoute.id) : null);
  const [selectedStop, setSelectedStop] = useState<GarbageStop | null>(() => {
    if (!initialRoute) return null;
    return (initialFocus && initialRoute.stops.find((stop) => stop.id === initialFocus.stopId)) ?? initialRoute.stops[0] ?? null;
  });
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [error, setError] = useState(invalidSharedPath ? "分享的路線已失效，請重新選擇路線。" : "");
  const [mobileStopOpen, setMobileStopOpen] = useState(() => Boolean(initialFocus?.showDetails && selectedStop && selectedStop.id === initialFocus.stopId));
  useEffect(() => { clearPendingStopFocus(); }, []);
  const [mapFailed, setMapFailed] = useState(false);
  // Keep the mobile map visible on entry; users open the search sheet explicitly.
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  // Nearby mode replaces the district result list until the user types or changes area.
  // It lives in a module store so it survives the remount when navigating into a route page.
  const locationSession = useLocationSession();
  const nearby = locationSession?.nearby ?? null;
  const userPosition = locationSession?.position ?? null;
  const [locateState, setLocateState] = useState<LocateState>(() => getLocationSession() ? "ready" : "idle");
  const [geoPermission, setGeoPermission] = useState<GeolocationPermission>("prompt");
  const [userAgent, setUserAgent] = useState("");
  // Re-render once a minute while nearby results are showing so "already passed" stays current.
  const [clockTick, setClockTick] = useState(0);
  // Read lazily: nearby mode never renders on the server, so the stored choice cannot cause a hydration mismatch.
  const [nearbySort, setNearbySort] = useState<NearbySort>(readNearbySort);
  const changeNearbySort = (next: NearbySort) => {
    if (next === nearbySort) return;
    setNearbySort(next); writeNearbySort(next);
    // Which situation people are in (must dump now vs. willing to wait); analytics never blocks the switch.
    try { track("nearby_sort_changed", { sort: next, from: nearbySort }); } catch { /* Tracking is optional. */ }
  };
  useEffect(() => {
    if (!nearby) return;
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [nearby]);

  useEffect(() => {
    let status: PermissionStatus | null = null;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserAgent(navigator.userAgent);
    queryGeolocationPermission().then((state) => { if (active) setGeoPermission(state); });
    // Track changes so the button recovers as soon as the user re-allows location in browser settings.
    if (typeof navigator !== "undefined" && "permissions" in navigator) {
      navigator.permissions.query({ name: "geolocation" }).then((result) => {
        if (!active) return;
        status = result;
        status.onchange = () => {
          setGeoPermission(result.state);
          if (result.state !== "denied") setLocateState((current) => current === "denied" ? "idle" : current);
        };
      }).catch(() => {});
    }
    return () => { active = false; if (status) status.onchange = null; };
  }, []);

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

  // Mobile browsers keep 100dvh while the on-screen keyboard is open and only shrink the visual
  // viewport, which leaves the bottom sheet (and the focused input) hidden under the keyboard.
  // Mirror the visual height into CSS so the layout shrinks above the keyboard instead.
  useEffect(() => {
    if (!isMobile) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--viewport-height", `${Math.round(viewport.height)}px`);
      // Follow Safari's viewport panning instead of fighting it with window.scrollTo.
      root.style.setProperty("--viewport-top", `${Math.round(viewport.offsetTop)}px`);
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--viewport-height");
      root.style.removeProperty("--viewport-top");
    };
  }, [isMobile]);

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
      setDistrict((current) => next.some((item: District) => item.name === current) ? current : next[0]?.name ?? "");
      if (next.length === 0) setLoadingRoutes(false);
    }).catch(() => {
      if (!active) return;
      setDistrictsFailed(true);
      setError("行政區載入失敗，請稍後再試。");
      setLoadingRoutes(false);
    }).finally(() => active && setLoadingDistricts(false));
    return () => { active = false; };
  }, [city]);

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

  const clearNearby = useCallback(() => {
    clearLocationSession();
    setLocateState((current) => current === "ready" ? "idle" : current);
  }, []);

  const applyResolvedArea = (nextCity: CityCode, nextDistrict: string) => {
    if (nextCity !== city) {
      setLoadingDistricts(true); setDistrictsFailed(false);
      setDistricts([]); setCity(nextCity);
    }
    setDistrict(nextDistrict);
    setRoute(null); setSelectedStop(null); setError("");
    // Only the inferred area goes into the URL; coordinates never do.
    router.replace(`/?${new URLSearchParams({ city: nextCity, district: nextDistrict })}`);
  };

  const locate = async () => {
    if (locateState === "locating") return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) { setLocateState("unsupported"); return; }
    const permission = await queryGeolocationPermission();
    setGeoPermission(permission);
    if (permission === "denied") { setLocateState("denied"); return; }
    setLocateState("locating");
    setQuery("");
    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = roundForRequest(position.coords.latitude);
      const lng = roundForRequest(position.coords.longitude);
      try {
        const response = await fetch(`/api/v1/nearby?${new URLSearchParams({ lat: String(lat), lng: String(lng) })}`);
        if (!response.ok) throw new Error("Nearby request failed");
        const result = await response.json();
        const data = result.data as NearbyResult;
        if (!data.resolved) { clearLocationSession(); setLocateState("outOfArea"); return; }
        applyResolvedArea(data.resolved.city, data.resolved.district);
        // The exact fix stays on the device for the map marker; only the rounded point was sent.
        setLocationSession({
          nearby: data,
          position: { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null, locatedAt: Date.now() },
        });
        setLocateState("ready");
      } catch {
        setLocateState("failed");
      }
    }, (positionError) => {
      const next = locateErrorState(positionError.code);
      if (next === "denied") setGeoPermission("denied");
      setLocateState(next);
    }, GEOLOCATION_OPTIONS);
  };

  const selectCity = (nextCity: CityCode) => {
    if (nextCity === city) return;
    clearNearby();
    setLoadingDistricts(true); setDistrictsFailed(false);
    setLoadingRoutes(true); setRoutes([]); setDistricts([]);
    setCity(nextCity); setDistrict(""); setRoute(null); setSelectedStop(null); setQuery(""); setError("");
    router.replace(`/?city=${nextCity}`);
  };

  const selectDistrict = (nextDistrict: string) => {
    clearNearby();
    setDistrict(nextDistrict); setRoute(null); setSelectedStop(null); setError("");
    const params = new URLSearchParams({ city, district: nextDistrict });
    if (query) params.set("q", query);
    router.replace(`/?${params}`);
  };

  /**
   * Open a route. `focus` names the stop to land on: nearby cards pass the stop
   * the user tapped (or the closest one) so the map jumps there instead of the
   * route's first stop. Falls back to stop 1 when the id is no longer in the route.
   */
  const selectRoute = async (summary: RouteSummary, focus?: { stopId: string; showDetails?: boolean }) => {
    setError("");
    try {
      const response = await fetch(`/api/v1/routes/${summary.id}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message);
      const detail = result.data as GarbageRoute;
      const focused = focus ? detail.stops.find((stop) => stop.id === focus.stopId) : undefined;
      // Also stash the focus for the remount that happens when this push leaves the home page.
      setPendingStopFocus(focused ? { routeId: detail.id, stopId: focused.id, showDetails: Boolean(focus?.showDetails) } : null);
      setRoute(detail);
      setSelectedStop(focused ?? detail.stops[0] ?? null);
      setMobileStopOpen(Boolean(focused && focus?.showDetails));
      setMobilePanelOpen(false);
      const search = new URLSearchParams();
      if (query) search.set("q", query);
      const suffix = search.size ? `?${search}` : "";
      router.push(`${routePath(detail)}${suffix}`);
    } catch {
      setError("找不到指定垃圾車路線，資料可能已更新。");
    }
  };

  // A nearby card is one link; the stop rows inside it carry data-stop-id so a tap
  // on a row lands on that stop, while a tap elsewhere lands on the closest stop.
  const selectNearbyRoute = (event: MouseEvent<HTMLAnchorElement>, item: NearbyRoute) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-stop-id]");
    const stopId = row?.dataset.stopId ?? item.nearby.stops[0]?.stopId;
    selectRoute(item, stopId ? { stopId, showDetails: Boolean(row) } : undefined);
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
  // Nearby mode only exists after a click, so reading the clock here never runs on the server.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nearbyGroups = useMemo(() => nearby ? { clock: taipeiClock(), ...partitionNearbyRoutes(nearby.routes, taipeiClock(), nearbySort) } : null, [nearby, clockTick, nearbySort]);
  // When ordering by time, flag the closest card so people who would rather wait can still spot it.
  const closestRouteId = nearbySort === "time" && nearbyGroups ? closestUpcomingRouteId(nearbyGroups.upcoming) : null;
  const validCount = useMemo(() => route?.stops.filter((stop) => stop.coordinateStatus === "valid").length ?? 0, [route]);
  const suspiciousIds = useMemo(() => suspiciousStopIds(route), [route]);
  const selectedWarning = useMemo(() => warningForStop(route, selectedStop), [route, selectedStop]);
  const warningCount = route?.coordinateWarnings?.length ?? 0;

  return (
    <main className="app-shell">
      {syncQueryFromUrl && <Suspense fallback={null}><SearchParamQuery onQuery={setQuery} /></Suspense>}
      <div className="explorer-viewport">
      <SiteHeader />
      {breadcrumb}

      <section className="workspace">
        <aside ref={sidebarRef} className={`sidebar ${mobilePanelOpen ? "is-open" : ""}`} aria-label="路線查詢">
          <button className="sheet-handle" aria-expanded={mobilePanelOpen} aria-controls="route-search-panel" onClick={() => setMobilePanelOpen((open) => !open)}>
            <span className="sheet-grip" aria-hidden="true" />
            <span className="sheet-label"><strong>{district || CITY_NAMES[city]}</strong><span>{mobilePanelOpen ? "收合路線搜尋" : route ? "搜尋其他路線" : "搜尋垃圾車路線"}</span><span aria-hidden="true">{mobilePanelOpen ? "⌄" : "⌃"}</span></span>
          </button>
          <div id="route-search-panel" className="search-panel-content" hidden={isMobile && !mobilePanelOpen}>
          {(!isMobile || mobilePanelOpen) && <>
          <div className="filters">
            <div className="step-label"><span>01</span> 選擇查詢範圍</div>
            <div className="city-tabs" aria-label="城市">
              {(Object.keys(CITY_NAMES) as CityCode[]).map((code) => <button key={code} className={city === code ? "active" : ""} aria-pressed={city === code} onClick={() => selectCity(code)}>{CITY_NAMES[code]}</button>)}
            </div>
            <label className="field-label" htmlFor="district">行政區</label>
            <div className={`select-wrap ${loadingDistricts ? "is-loading" : ""}`}>
              <select id="district" value={loadingDistricts || districts.length === 0 ? "" : district} disabled={loadingDistricts || districts.length === 0} aria-busy={loadingDistricts} onChange={(event) => selectDistrict(event.target.value)}>
                {loadingDistricts ? <option value="">正在載入行政區…</option> : districts.length === 0 ? <option value="">{districtsFailed ? "行政區載入失敗" : "暫無可選行政區"}</option> : districts.map((item) => <option value={item.name} key={item.name}>{item.name}（{item.routeCount} 條）</option>)}
              </select>
            </div>
            <label className="field-label route-search-label" htmlFor="route-search">搜尋{district || CITY_NAMES[city]}的路名或停靠點</label>
            <div className="search-wrap"><span aria-hidden="true">⌕</span><input ref={searchInputRef} id="route-search" value={query} onChange={(event) => { if (nearby) clearNearby(); setQuery(event.target.value); }} placeholder={district === "士林區" ? "例如：延平北路、社子" : "輸入路名、地點或路線名稱"} /></div>
            <div className="locate-row">
              <TrackedLocationButton source="route_search" type="button" className="locate-button" onClick={locate} disabled={locateState === "locating" || geoPermission === "unsupported"} aria-busy={locateState === "locating"} aria-describedby="locate-hint">
                <span aria-hidden="true">{locateState === "locating" ? <span className="spinner locate-spinner" /> : "◎"}</span>
                {locateState === "locating" ? "定位中…" : "使用目前位置"}
              </TrackedLocationButton>
              <small id="locate-hint">僅用於查詢附近路線，不會儲存位置</small>
            </div>
            {locateMessage(locateState, userAgent) && <p className={`locate-message ${locateState === "denied" ? "is-blocked" : ""}`} role="status">{locateMessage(locateState, userAgent)}</p>}
          </div>

          <div className="route-results">
            {nearby ? <>
              <div className="results-heading"><div className="step-label"><span>02</span> 附近的路線</div><button type="button" className="clear-nearby" onClick={clearNearby}>清除定位</button></div>
              <p className="nearby-summary">你附近 {nearby.radius >= 1000 ? "1 公里" : `${nearby.radius} 公尺`}內有 {nearby.routes.length} 條路線{nearby.resolved ? `，位置約在${CITY_NAMES[nearby.resolved.city]}${nearby.resolved.district}` : ""}。{nearby.expanded && "500 公尺內沒有站點，已擴大到 1 公里。"}</p>
              {nearby.routes.length > 1 && <div className="nearby-sort" role="group" aria-label="附近路線排序">
                <button type="button" className={nearbySort === "time" ? "active" : ""} aria-pressed={nearbySort === "time"} onClick={() => changeNearbySort("time")}>最快抵達</button>
                <button type="button" className={nearbySort === "distance" ? "active" : ""} aria-pressed={nearbySort === "distance"} onClick={() => changeNearbySort("distance")}>最近距離</button>
                <small>{nearbySort === "time" ? "現在就要丟：先看最快到的車" : "願意等：先看離你最近的站"}</small>
              </div>}
              {userPosition?.accuracy != null && userPosition.accuracy > ACCURACY_WARNING_METERS && <p className="nearby-accuracy-warning" role="status">定位誤差約 {formatDistance(userPosition.accuracy)}，附近結果僅供參考，建議改用路名搜尋確認。</p>}
              {nearby.routes.length === 0 || !nearbyGroups ? <div className="empty-state"><span>1 公里內沒有垃圾車站點</span><p>請改用行政區與路名搜尋</p>{nearby.resolved && <FeedbackButton label="附近應該有站點？告訴我們" context={{ entry: "empty_nearby", city: nearby.resolved.city, district: nearby.resolved.district, radius: String(nearby.radius) }} summary={`${CITY_NAMES[nearby.resolved.city]}・${nearby.resolved.district}・附近 ${nearby.radius} 公尺無結果`} />}</div> : (
                <div className="route-list">
                  {nearbyGroups.upcoming.length === 0 && <p className="nearby-all-passed">附近路線今天的表定時間都已過，或今日不收。以下列表可供規劃其他日子。</p>}
                  {nearbyGroups.upcoming.map(({ route: item, timing }) => <Link key={item.id} href={routePath(item)} prefetch={false} className={`route-card nearby-card ${route?.id === item.id ? "selected" : ""}`} aria-current={route?.id === item.id ? "page" : undefined} onClick={(event) => selectNearbyRoute(event, item)}>
                    <NearbyRouteCard item={item} clock={nearbyGroups.clock} timing={timing} closest={item.id === closestRouteId} />
                  </Link>)}
                  {nearbyGroups.later.length > 0 && <details className="nearby-later" open={nearbyGroups.upcoming.length === 0}>
                    <summary>今天已過或不收的 {nearbyGroups.later.length} 條路線</summary>
                    {nearbyGroups.later.map(({ route: item, timing }) => <Link key={item.id} href={routePath(item)} prefetch={false} className={`route-card nearby-card is-later ${route?.id === item.id ? "selected" : ""}`} aria-current={route?.id === item.id ? "page" : undefined} onClick={(event) => selectNearbyRoute(event, item)}>
                      <NearbyRouteCard item={item} clock={nearbyGroups.clock} timing={timing} />
                    </Link>)}
                  </details>}
                  <p className="results-note">以上為表定清運時間與站點距離，非車輛即時位置。「已過表定時間」不代表車輛已離開，假日或臨時調整請以清潔隊公告為準。</p>
                </div>
              )}
            </> : <>
            <div className="results-heading"><div className="step-label"><span>02</span> 選擇路線</div><small>{loadingRoutes ? "查詢中…" : `${routes.length} 條結果`}</small></div>
            {error && <div className="alert" role="alert">{error}</div>}
            {loadingRoutes ? <div className="routes-loading" role="status"><span className="spinner" aria-hidden="true" /><span>正在載入路線資料…</span></div> : routes.length === 0 ? !error && <div className="empty-state"><span>沒有相符路線</span><p>試試其他關鍵字或行政區</p>{district && <FeedbackButton label="找不到要找的地點？告訴我們" context={{ entry: "empty_search", city, district, query: debouncedQuery }} summary={`${CITY_NAMES[city]}・${district}${debouncedQuery ? `・搜尋：${debouncedQuery}` : ""}`} />}</div> : (
              <div className="route-list">
                {routes.map((item) => <Link key={item.id} href={routePath(item)} prefetch={false} className={`route-card ${route?.id === item.id ? "selected" : ""}`} aria-current={route?.id === item.id ? "page" : undefined} onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); selectRoute(item); }}>
                  <span className="route-card-top"><strong>{item.routeName}{item.tripLabel ? `・${item.tripLabel}` : ""}</strong><i>›</i></span>
                  <span className="route-time">{item.firstArrivalTime ?? "--:--"}<em>—</em>{item.lastArrivalTime ?? "--:--"}</span>
                  <span className="route-card-bottom">
                    <span className="route-meta">{item.startStopName ?? "起點未提供"} → {item.endStopName ?? "終點未提供"}</span>
                    <span className="route-count">共 {item.stopCount} 站</span>
                  </span>
                </Link>)}
              </div>
            )}
            </>}
          </div>
          </>}
          </div>
        </aside>

        <section className="map-stage" ref={mapStageRef} tabIndex={-1} aria-label="路線地圖與所選停靠點">
          {mapFailed ? <div className="map-fallback"><strong>地圖目前無法載入</strong><p>仍可從路線面板查看完整停靠點。</p><button onClick={() => { setMapFailed(false); window.location.reload(); }}>重新載入</button></div> : <RouteMap route={route} selectedStop={selectedStop} userPosition={userPosition} onSelectStop={chooseStop} onMapError={handleMapError} />}
          {!route && !invalidSharedPath && <div className="map-intro"><p className="eyebrow">TAIPEI · NEW TAIPEI</p><h1>台北、新北<br />垃圾車時間與路線查詢</h1><p>今晚的垃圾車會停在哪裡？<br />選擇城市、行政區與路線，查看每一站的表定時間。</p><div className="intro-steps"><span><b>1</b>選城市</span><i>→</i><span><b>2</b>選行政區</span><i>→</i><span><b>3</b>看路線</span></div><button type="button" className="intro-search-button" onClick={openRouteSearch} aria-controls="route-search-panel">搜尋路名或地點 →</button></div>}
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

      </div>

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
