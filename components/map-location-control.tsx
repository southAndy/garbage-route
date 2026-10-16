"use client";

import { useEffect, useRef, useState } from "react";
import type { GarbageRoute } from "../lib/types";
import { formatDistance, GEOLOCATION_OPTIONS, locateErrorState, locateMessage, type LocateState } from "../lib/geolocation";
import { clearLocationSession, nearestStopDistanceMeters, setLocationSession, useLocationSession } from "../lib/user-location";
import { suspiciousStopIds } from "../lib/route-display";

export default function MapLocationControl({ route }: { route: GarbageRoute }) {
  const session = useLocationSession();
  const [state, setState] = useState<LocateState>("idle");
  const request = useRef(0);
  const pending = useRef(false);
  useEffect(() => () => { request.current += 1; pending.current = false; }, []);

  const locate = () => {
    if (pending.current) return;
    if (!navigator.geolocation) { setState("unsupported"); return; }
    const id = ++request.current;
    pending.current = true;
    setState("locating");
    navigator.geolocation.getCurrentPosition((result) => {
      if (id !== request.current) return;
      pending.current = false;
      // A map-only fix never changes the route or sends coordinates to the server.
      setLocationSession({ nearby: null, position: {
        lat: result.coords.latitude, lng: result.coords.longitude,
        accuracy: Number.isFinite(result.coords.accuracy) ? result.coords.accuracy : null,
        locatedAt: Date.now(),
      } });
      setState("ready");
    }, (error) => {
      if (id !== request.current) return;
      pending.current = false;
      setState(locateErrorState(error.code));
    }, GEOLOCATION_OPTIONS);
  };

  const position = session?.position;
  const suspicious = suspiciousStopIds(route);
  const distance = position ? nearestStopDistanceMeters(position, route.stops.filter((stop) => !suspicious.has(stop.id))) : null;
  const error = state === "failed" ? "定位失敗，請稍後再試。" : locateMessage(state, typeof navigator === "undefined" ? "" : navigator.userAgent);

  return <div className="map-location-control">
    <div className="map-location-actions">
      <button type="button" className="locate-button" onClick={locate} disabled={state === "locating"} aria-busy={state === "locating"}>
        {state === "locating" ? "定位中…" : position ? "更新我的位置" : "◎ 定位我的位置"}
      </button>
      {position && <button type="button" className="clear-nearby" onClick={() => {
        request.current += 1; pending.current = false;
        clearLocationSession(); setState("idle");
      }}>清除定位</button>}
    </div>
    <div role="status">
      {error && <p>{error}</p>}
      {position && <>
        <p>藍點為你的位置{position.accuracy !== null ? `，定位誤差約 ${formatDistance(position.accuracy)}` : ""}。</p>
        <p>{distance === null ? "此路線暫無可確認距離的站點。" : `距此路線最近站點約 ${formatDistance(distance)}（直線距離）。`}</p>
        {error && <p>地圖仍顯示上次成功定位的位置。</p>}
      </>}
    </div>
    <small>按下後取得位置，僅於本次瀏覽使用。</small>
  </div>;
}
