"use client";

import TrackedLocationButton from "./tracked-location-button";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GEOLOCATION_OPTIONS, formatDistance, locateErrorState, locateMessage, roundForRequest, type LocateState } from "../lib/geolocation";
import { ACCURACY_WARNING_METERS, clearLocationSession, setLocationSession, useLocationSession } from "../lib/user-location";
import type { NearbyResult } from "../lib/nearby-search";
import { CITY_NAMES, districtPath, routePath } from "../lib/paths";
import type { CityCode } from "../lib/types";
import NearbyRouteCard from "./nearby-route-card";

export default function DistrictLocationSearch({ city, districtSlug }: { city: CityCode; districtSlug: string }) {
  const router = useRouter();
  const session = useLocationSession();
  const [state, setState] = useState<LocateState>("idle");
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => () => { generation.current++; pending.current = false; }, []);

  const locate = () => {
    if (pending.current) return;
    if (!navigator.geolocation) { setState("unsupported"); return; }
    const id = ++generation.current;
    pending.current = true;
    setState("locating");
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      if (id !== generation.current) return;
      try {
        const params = new URLSearchParams({ lat: String(roundForRequest(coords.latitude)), lng: String(roundForRequest(coords.longitude)) });
        const response = await fetch(`/api/v1/nearby?${params}`);
        if (!response.ok) throw new Error("Nearby request failed");
        const { data } = await response.json() as { data: NearbyResult };
        if (id !== generation.current) return;
        if (!data.resolved) { clearLocationSession(); setState("outOfArea"); return; }
        setLocationSession({ nearby: data, position: {
          lat: coords.latitude, lng: coords.longitude,
          accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null, locatedAt: Date.now(),
        } });
        setState("ready");
        if (data.resolved.city !== city || data.resolved.districtSlug !== districtSlug) {
          router.push(districtPath(data.resolved.city, data.resolved.districtSlug));
        }
      } catch {
        if (id === generation.current) setState("failed");
      } finally {
        if (id === generation.current) pending.current = false;
      }
    }, (error) => {
      if (id !== generation.current) return;
      pending.current = false;
      setState(locateErrorState(error.code));
    }, GEOLOCATION_OPTIONS);
  };

  // Hide another area's cached results, including while navigation is pending.
  const resolved = session?.nearby?.resolved;
  const nearby = resolved?.city === city && resolved.districtSlug === districtSlug ? session?.nearby : null;
  const message = locateMessage(state, typeof navigator === "undefined" ? "" : navigator.userAgent);
  return <section className="district-location-search" aria-label="定位查詢附近路線">
    <div className="locate-row">
      <TrackedLocationButton source="district_search" type="button" className="locate-button" disabled={state === "locating"} aria-busy={state === "locating"} onClick={locate}>
        {state === "locating" ? "正在定位與查詢…" : "◎ 使用目前位置查附近路線"}
      </TrackedLocationButton>
      {nearby && <button type="button" className="clear-nearby" onClick={() => {
        generation.current++; pending.current = false; clearLocationSession(); setState("idle");
      }}>清除定位</button>}
    </div>
    <p className="hub-note">允許定位後，將切換至所在行政區並顯示附近路線。僅傳送約略座標查詢，不會儲存位置。</p>
    <div role="status">
      {message && <p className="locate-message">{message}{nearby && " 下方仍為上次成功查詢的結果。"}</p>}
      {nearby?.resolved && <p>位置約在{CITY_NAMES[nearby.resolved.city]}{nearby.resolved.district}，{formatDistance(nearby.radius)}內有 {nearby.routes.length} 條路線。{nearby.expanded && "已擴大查詢至 1 公里。"}</p>}
      {nearby && session && session.position.accuracy !== null && session.position.accuracy > ACCURACY_WARNING_METERS && <p className="nearby-accuracy-warning">定位誤差約 {formatDistance(session.position.accuracy)}，結果僅供參考。</p>}
    </div>
    {nearby && <>
      {nearby.routes.length === 0 ? <p>附近沒有站點，請使用下方完整路線列表查詢。</p> : <ul className="hub-grid">
        {nearby.routes.map((route) => <li key={route.id}><Link href={routePath(route)} prefetch={false} className="route-card nearby-card"><NearbyRouteCard item={route} /></Link></li>)}
      </ul>}
      <p className="hub-note">距離為直線距離，時間為表定資訊，非車輛即時位置。</p>
    </>}
  </section>;
}
