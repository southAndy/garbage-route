"use client";

import dynamic from "next/dynamic";
import CollectionPointHours from "./collection-point-hours";
import CollectionPointSurvey from "./collection-point-survey";
import FeedbackButton from "./feedback-button";
import { feedbackUrls } from "../lib/feedback";
import { useCollectionSurvey } from "../lib/use-collection-survey";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatDistance, GEOLOCATION_OPTIONS, locateErrorState, locateMessage, type LocateState } from "../lib/geolocation";
import { haversineMeters } from "../lib/nearby-search";
import { CITY_NAMES, collectionPointsPath } from "../lib/paths";
import { collectionPointNavigationUrl, hasCollectionPointCoordinates, readCollectionPointScope, type CollectionPointDistricts } from "../lib/collection-point-view";
import type { CityCode } from "../lib/types";
import type { CollectionPoint } from "../lib/collection-points";

const CollectionPointMap = dynamic(() => import("./collection-point-map"), {
  ssr: false, loading: () => <p className="collection-map-placeholder" role="status">正在準備收受點地圖…</p>,
});
const taipeiMap = "https://www.dep-trash-can.gov.taipei/tcr/";
const newTaipeiMap = "https://crd-rubbish.epd.ntpc.gov.tw/dispPageBox/Ntpcepd/NtpMP.aspx?ddsPageID=MAP";
const source = "https://data.taipei/dataset/detail?id=1acf38f3-1509-4cb1-898a-9b1d4f31a3af";
const desktopQuery = "(min-width: 761px)";
function subscribeViewport(onChange: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function desktopSnapshot() { return window.matchMedia(desktopQuery).matches; }
function serverDesktopSnapshot() { return false; }

function useCollectionResults(points: CollectionPoint[], district: string, position: { lat: number; lng: number } | null) {
  const positionLat = position?.lat;
  const positionLng = position?.lng;
  return useMemo(() => points.filter((point) => !district || point.district === district).map((point) => ({
    ...point,
    distance: positionLat !== undefined && positionLng !== undefined && hasCollectionPointCoordinates(point)
      ? haversineMeters({ lat: positionLat, lng: positionLng }, { lat: point.latitude, lng: point.longitude }) : null,
  })).sort((a, b) => positionLat !== undefined
    ? (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name, "zh-Hant")
    : a.district.localeCompare(b.district, "zh-Hant") || a.name.localeCompare(b.name, "zh-Hant")), [points, district, positionLat, positionLng]);
}

export default function CollectionPointFinder({ points, failed, districts }: { points: CollectionPoint[]; failed: boolean; districts: CollectionPointDistricts }) {
  const params = useSearchParams();
  const { city, district } = readCollectionPointScope(params, districts);
  const isDesktop = useSyncExternalStore(subscribeViewport, desktopSnapshot, serverDesktopSnapshot);
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<LocateState>("idle");
  const resultsRoot = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const pending = useRef(false);
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  useEffect(() => () => { request.current++; }, []);
  const results = useCollectionResults(points, district, position);
  const selected = results.find((point) => point.id === selectedId) ?? null;
  const mappableCount = results.filter(hasCollectionPointCoordinates).length;

  const survey = useCollectionSurvey({ root: resultsRoot, city, district, view, selectedId: selected?.id ?? null,
    isDesktop, empty: results.length === 0, enabled: city === "TPE" && !failed,
    pointsKey: results.map((point) => point.id).join("|") });
  const surveyPointId = survey.prompt?.context.point_id;
  const feedbackAvailable = Boolean(feedbackUrls(process.env.NEXT_PUBLIC_TALLY_FORM_URL, { entry: "collection_points" }));

  function changeScope(nextCity: CityCode, nextDistrict = "") {
    if (nextCity === city && nextDistrict === district) return;
    setSelectedId(null);
    // Next.js synchronizes useSearchParams with native history without reloading the CSV.
    window.history.replaceState(null, "", collectionPointsPath(nextCity, nextDistrict));
  }

  const selectFromMap = useCallback((id: string) => {
    setSelectedId(id);
    setView("map");
    if (isDesktop) cardRefs.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [isDesktop]);

  function showSelectedInList() {
    setView("list");
    requestAnimationFrame(() => {
      const card = selected && cardRefs.current.get(selected.id);
      card?.scrollIntoView({ block: "nearest", behavior: "instant" });
      card?.focus({ preventScroll: true });
    });
  }

  function locate() {
    if (pending.current) return;
    if (!navigator.geolocation) { setState("unsupported"); return; }
    const id = ++request.current;
    pending.current = true;
    setState("locating");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (id !== request.current) return;
      pending.current = false;
      if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) { setState("failed"); return; }
      setPosition({ lat: coords.latitude, lng: coords.longitude });
      setState("ready");
    }, (error) => {
      if (id !== request.current) return;
      pending.current = false;
      setState(locateErrorState(error.code));
    }, GEOLOCATION_OPTIONS);
  }

  return <>
    <div className="city-tabs" role="group" aria-label="收受點城市">
      <button type="button" className={city === "TPE" ? "active" : ""} aria-pressed={city === "TPE"} onClick={() => changeScope("TPE", city === "TPE" ? district : "")}>臺北市</button>
      <button type="button" className={city === "NTP" ? "active" : ""} aria-pressed={city === "NTP"} onClick={() => changeScope("NTP", city === "NTP" ? district : "")}>新北市</button>
    </div>
    <div className="collection-scope">
      <div><strong>{CITY_NAMES[city]}{district}限時收受點</strong><p>{district ? "已依目前地區篩選，可切換其他行政區。" : "選擇行政區，或依目前位置尋找方便前往的收受點。"}</p></div>
      {district && <button type="button" onClick={() => changeScope(city)}>查看全{CITY_NAMES[city]}</button>}
    </div>
    {city === "NTP" ? <section className="collection-official">
      <h2>新北市{district}限時定點收運</h2>
      <p>前往官方地圖，點選「全市定點」，{district ? `再找${district}的地點` : "再選擇地點"}查看收運項目與時間。</p>
      <p>本站尚未提供新北定點列表與距離排序，請以官方地圖為準。</p>
      <a href={newTaipeiMap} target="_blank" rel="noopener noreferrer">開啟新北官方定點地圖 ↗</a>
    </section> : <>
      <div className="collection-notice">
        <strong>出發前，請先核對時段</strong>
        <p>以下保留官方時段與收受規定原文，不代表此刻開放。假日、臨時停收及可收種類以官方公告為準；不要在未開放時將垃圾留在現場。</p>
        <a href={taipeiMap} target="_blank" rel="noopener noreferrer">查看臺北官方「限時收受點」 ↗</a>
      </div>
      {failed ? <div className="collection-official" role="status">
        <h2>暫時無法載入臺北收受點</h2>
        <p>你仍可使用上方官方查詢入口，查看地址與收受時間，或稍後重新整理本頁。</p>
      </div> : <>
        <div className="collection-filters">
          <label>行政區<select value={district} onChange={(event) => changeScope("TPE", event.target.value)}><option value="">全部行政區</option>{districts.TPE.map((item) => <option key={item}>{item}</option>)}</select></label>
          <button type="button" className="locate-button" disabled={state === "locating"} onClick={locate}>{state === "locating" ? "定位中…" : "依目前位置排序"}</button>
          {position && <button type="button" className="clear-nearby" onClick={() => { request.current++; pending.current = false; setPosition(null); setState("idle"); }}>清除位置</button>}
        </div>
        <p className="collection-location-note">位置只在此頁計算直線距離，不會傳送至伺服器。導航僅傳送收受點目的地至 Google 地圖。</p>
        <div className="collection-results-bar">
          <p role="status">{locateMessage(state, typeof navigator === "undefined" ? "" : navigator.userAgent)} {position ? `已依距離排序${district ? `（限${district}）` : ""}，共 ${results.length} 處。距離不是步行距離，也不代表正在收受。` : `共 ${results.length} 處收受點。`}</p>
          <div className="collection-view-switch" role="group" aria-label="收受點顯示方式">
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>列表</button>
            <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>地圖</button>
          </div>
        </div>
        <div ref={resultsRoot}>
        {results.length === 0 ? <div className="collection-empty" data-survey-empty>
          <strong>{district || "此範圍"}目前沒有收受點資料</strong>
          <p>可以擴大範圍尋找方便前往的地點，或查看官方地圖。</p>
          {district && <button type="button" onClick={() => changeScope("TPE")}>顯示全部行政區</button>}
          <CollectionPointSurvey survey={survey} />
        </div> : <div className={`collection-workspace collection-view-${view}`}>
          <div className="collection-list-panel" id="collection-list-panel" hidden={!isDesktop && view !== "list"}>
            <ul className="collection-grid" aria-label="限時收受點列表">
              {results.map((point) => <li key={point.id} data-survey-card={point.id} ref={(node) => { if (node) cardRefs.current.set(point.id, node); else cardRefs.current.delete(point.id); }} tabIndex={-1} className={`collection-card${selected?.id === point.id ? " is-selected" : ""}`} aria-label={point.name}>
                <div className="collection-card-heading"><span>{point.district}</span>{point.distance !== null && <span>直線 {formatDistance(point.distance)}</span>}{selected?.id === point.id && <span className="collection-selected-label">已選取</span>}</div>
                <h2>{point.name}</h2>
                <p>{point.address}</p>
                <CollectionPointHours notes={point.notes} />
                {(isDesktop || view === "list") && point.id === surveyPointId && <CollectionPointSurvey survey={survey} />}
                <div className="collection-card-actions">
                  {hasCollectionPointCoordinates(point) && <button type="button" className="collection-show-map" aria-label={`${point.name}：在地圖查看`} aria-pressed={selected?.id === point.id} onClick={() => { setSelectedId(point.id); setView("map"); }}>在地圖查看</button>}
                  <a href={collectionPointNavigationUrl(point)} target="_blank" rel="noopener noreferrer">前往導航 ↗</a>
                  {point.phone && <span>電話：{point.phone}</span>}
                </div>
                {!hasCollectionPointCoordinates(point) && <p className="hub-note">此點無可靠座標，導航使用地址搜尋，請核對目的地。</p>}
              </li>)}
            </ul>
          </div>
          <section className="collection-map-panel" aria-label="收受點地圖檢視" hidden={!isDesktop && view !== "map"}>
            {(isDesktop || view === "map") && <CollectionPointMap points={results} selectedId={selected?.id ?? null} position={position} onSelect={selectFromMap} />}
            <p className="collection-map-legend"><span aria-hidden="true">●</span> 地圖標記為收受位置，不代表正在開放。{mappableCount < results.length && `另有 ${results.length - mappableCount} 處無可靠座標，請至列表查看。`}</p>
            {selected ? <div className="collection-map-detail" data-survey-map-detail aria-label="地圖選取的收受點">
              <div className="collection-card-heading"><span>{selected.district}</span>{selected.distance !== null && <span>直線 {formatDistance(selected.distance)}</span>}</div>
              <h2>{selected.name}</h2><p>{selected.address}</p>
              <CollectionPointHours notes={selected.notes} />
              {!isDesktop && view === "map" && <CollectionPointSurvey survey={survey} />}
              <div className="collection-card-actions"><button type="button" onClick={showSelectedInList}>查看列表詳情</button><a href={collectionPointNavigationUrl(selected)} target="_blank" rel="noopener noreferrer">前往導航 ↗</a></div>
            </div> : <p className="collection-map-hint">點選地圖標記，查看收受時段與導航。</p>}
          </section>
        </div>}
        </div>
      </>}
      <p className="hub-note">資料來源：<a href={source} target="_blank" rel="noopener noreferrer">臺北市環保局開放資料</a>。來源更新日期請見官方頁面，出發前請核對最新公告。</p>
    </>}
    {feedbackAvailable && <div className="collection-feedback-entry">
        <p>有其他想改善的地方嗎？隨時告訴我們。</p>
        <FeedbackButton label="提供收受點建議" dialogTitle="收受點查詢建議"
          context={{ entry: "collection_points", page_type: "collection_points", city, district,
            ...(city === "TPE" ? { view_mode: view, ...(selected ? { point_id: selected.id } : {}) } : {}) }}
          summary={`${CITY_NAMES[city]}${district ? `・${district}` : "・全部行政區"}・${city === "TPE" ? view === "map" ? "地圖" : "列表" : "官方查詢入口"}${city === "TPE" && selected ? `・${selected.name}` : ""}`} />
    </div>}
  </>;
}
