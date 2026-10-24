"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistance, GEOLOCATION_OPTIONS, locateErrorState, locateMessage, type LocateState } from "../lib/geolocation";
import { haversineMeters } from "../lib/nearby-search";
import type { CollectionPoint } from "../lib/collection-points";

const taipeiMap = "https://www.dep-trash-can.gov.taipei/tcr/";
const newTaipeiMap = "https://crd-rubbish.epd.ntpc.gov.tw/dispPageBox/Ntpcepd/NtpMP.aspx?ddsPageID=MAP";
const source = "https://data.taipei/dataset/detail?id=1acf38f3-1509-4cb1-898a-9b1d4f31a3af";

export default function CollectionPointFinder({ points, failed }: { points: CollectionPoint[]; failed: boolean }) {
  const [city, setCity] = useState("TPE");
  const [district, setDistrict] = useState("");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<LocateState>("idle");
  const request = useRef(0);
  const pending = useRef(false);
  useEffect(() => () => { request.current++; }, []);
  const districts = useMemo(() => [...new Set(points.map((point) => point.district))].sort((a, b) => a.localeCompare(b, "zh-Hant")), [points]);
  const results = useMemo(() => points.filter((point) => !district || point.district === district).map((point) => ({
    ...point,
    distance: position && point.latitude !== null && point.longitude !== null
      ? haversineMeters(position, { lat: point.latitude, lng: point.longitude }) : null,
  })).sort((a, b) => position
    ? (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name, "zh-Hant")
    : a.district.localeCompare(b.district, "zh-Hant") || a.name.localeCompare(b.name, "zh-Hant")), [points, district, position]);

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
      <button type="button" className={city === "TPE" ? "active" : ""} aria-pressed={city === "TPE"} onClick={() => setCity("TPE")}>臺北市</button>
      <button type="button" className={city === "NTP" ? "active" : ""} aria-pressed={city === "NTP"} onClick={() => setCity("NTP")}>新北市</button>
    </div>
    {city === "NTP" ? <section className="collection-official">
      <h2>新北市限時定點收運</h2>
      <p>前往官方地圖，點選「全市定點」，再選擇地點查看收運項目與時間。</p>
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
          <label>行政區<select value={district} onChange={(event) => setDistrict(event.target.value)}><option value="">全部行政區</option>{districts.map((item) => <option key={item}>{item}</option>)}</select></label>
          <button type="button" className="locate-button" disabled={state === "locating"} onClick={locate}>{state === "locating" ? "定位中…" : "依目前位置排序"}</button>
          {position && <button type="button" className="clear-nearby" onClick={() => { request.current++; pending.current = false; setPosition(null); setState("idle"); }}>清除位置</button>}
        </div>
        <p className="hub-note">位置只在此頁計算直線距離，不會傳送至伺服器。導航僅傳送收受點目的地至 Google 地圖。</p>
        <p role="status">{locateMessage(state, typeof navigator === "undefined" ? "" : navigator.userAgent)} {position ? `已依距離排序${district ? `（限${district}）` : ""}，共 ${results.length} 處。距離不是步行距離，也不代表正在收受。` : `共 ${results.length} 處收受點。`}</p>
        <ul className="collection-grid">
          {results.map((point) => <li key={point.id} className="collection-card">
            <div className="collection-card-heading"><span>{point.district}</span>{point.distance !== null && <span>直線 {formatDistance(point.distance)}</span>}</div>
            <h2>{point.name}</h2>
            <p>{point.address}</p>
            <h3>收受時段與規定（官方原文）</h3>
            <p className="collection-notes">{point.notes}</p>
            <div className="collection-card-actions">
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point.latitude !== null && point.longitude !== null ? `${point.latitude},${point.longitude}` : `臺北市${point.district} ${point.address}`)}`} target="_blank" rel="noopener noreferrer">前往導航 ↗</a>
              {point.phone && <span>電話：{point.phone}</span>}
            </div>
            {point.latitude === null && <p className="hub-note">此點無可靠座標，導航使用地址搜尋，請核對目的地。</p>}
          </li>)}
        </ul>
        {results.length === 0 && <p role="status">此篩選條件沒有收受點，請選擇其他行政區或查看官方地圖。</p>}
      </>}
      <p className="hub-note">資料來源：<a href={source} target="_blank" rel="noopener noreferrer">臺北市環保局開放資料</a>。來源更新日期請見官方頁面，出發前請核對最新公告。</p>
    </>}
  </>;
}
