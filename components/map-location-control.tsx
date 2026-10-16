"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { GarbageRoute } from "../lib/types";
import { formatDistance, GEOLOCATION_OPTIONS, locateErrorState, locateMessage, type LocateState } from "../lib/geolocation";
import { clearLocationSession, nearestStopDistanceMeters, setLocationSession, useLocationSession } from "../lib/user-location";
import { suspiciousStopIds } from "../lib/route-display";

export default function MapLocationControl({ route, onFocusPosition }: { route: GarbageRoute | null; onFocusPosition?: () => void }) {
  const session = useLocationSession();
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const collapse = () => { setExpanded(false); trigger.current?.focus(); };
  const [state, setState] = useState<LocateState>("idle");
  const [expanded, setExpanded] = useState(false);
  const request = useRef(0);
  const pending = useRef(false);
  useEffect(() => () => { request.current += 1; pending.current = false; }, []);

  const locate = () => {
    if (pending.current) return;
    if (!navigator.geolocation) { setState("unsupported"); setExpanded(true); return; }
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
      setExpanded(false);
    }, (error) => {
      if (id !== request.current) return;
      pending.current = false;
      setState(locateErrorState(error.code));
      setExpanded(true);
    }, GEOLOCATION_OPTIONS);
  };

  const position = session?.position;
  const suspicious = route ? suspiciousStopIds(route) : new Set<string>();
  const distance = position && route ? nearestStopDistanceMeters(position, route.stops.filter((stop) => !suspicious.has(stop.id))) : null;
  const error = state === "failed" ? "定位失敗，請稍後再試。" : locateMessage(state, typeof navigator === "undefined" ? "" : navigator.userAgent);

  const label = state === "locating" ? "定位中…" : position ? "回到我的位置" : "定位我的位置";

  return <>
    <button ref={trigger} type="button" className={`locate-me-button${position ? " has-position" : ""}`} aria-label={label} title={label} aria-expanded={expanded} aria-controls={panelId} disabled={state === "locating"} aria-busy={state === "locating"} onClick={() => {
      if (position) { onFocusPosition?.(); setExpanded((value) => !value); }
      else locate();
    }}><span aria-hidden="true" /></button>
    {expanded && <div id={panelId} className="map-location-control" onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); collapse(); }
    }}>
    <div className="map-location-actions">
      <button type="button" className="locate-button" onClick={locate} disabled={state === "locating"} aria-busy={state === "locating"}>
        {state === "locating" ? "定位中…" : position ? "更新我的位置" : "重新定位"}
      </button>
      {position && expanded && <button type="button" className="clear-nearby" onClick={() => {
        request.current += 1; pending.current = false;
        clearLocationSession(); setState("idle"); collapse();
      }}>清除定位</button>}
      {expanded && <button type="button" className="clear-nearby" aria-expanded={true} onClick={collapse}>收合</button>}
    </div>
    <div role="status">
      {expanded && <>
      {error && <p>{error}</p>}
      {position && <>
        <p>藍點為你的位置{position.accuracy !== null ? `，定位誤差約 ${formatDistance(position.accuracy)}` : ""}。</p>
        {route && <p>{distance === null ? "此路線暫無可確認距離的站點。" : `距此路線最近站點約 ${formatDistance(distance)}（直線距離）。`}</p>}
        {error && <p>地圖仍顯示上次成功定位的位置。</p>}
      </>}
      </>}
    </div>
    {expanded && <small>按下後取得位置，僅於本次瀏覽使用。</small>}
  </div>}
  </>;
}
