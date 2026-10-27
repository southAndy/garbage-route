"use client";

import { track } from "@vercel/analytics";
import { useEffect, useRef } from "react";

function recordLocation(event: "location_button_viewed" | "location_button_clicked") {
  try { track(event, { source: "route_search" }); } catch { /* Tracking must not block location access. */ }
}

export default function LocationMethodSelect({ current, locating, unsupported, onMap, onLocate }: {
  current: "map" | "device" | null;
  locating: boolean;
  unsupported: boolean;
  onMap: () => void;
  onLocate: () => void;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const viewed = useRef(false);
  useEffect(() => {
    const select = selectRef.current;
    if (!select || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (viewed.current || !entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      viewed.current = true;
      recordLocation("location_button_viewed");
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(select);
    return () => observer.disconnect();
  }, []);
  const label = locating ? "定位中…" : current === "map" ? "目前：地圖參考位置" : current === "device" ? "目前：裝置定位" : "選擇參考位置";
  return <div className="location-method-control">
    <svg className="location-method-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="10" cy="10" r="6" />
      <path d="M10 1v3M10 16v3M1 10h3M16 10h3" />
      {current && <circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />}
    </svg>
    <select ref={selectRef} className="location-method-select" aria-label="選擇參考位置方式" value="" disabled={locating} aria-busy={locating} onChange={(event) => {
      const method = event.target.value;
      if (locating || (method !== "map" && method !== "device") || (method === "device" && unsupported)) return;
      try { track("location_method_selected", { method }); } catch { /* Analytics is optional. */ }
      if (method === "map") onMap();
      else {
        // Preserve the original location funnel, including clicks before the
        // visibility callback. Map picking is not a device-location click.
        if (!viewed.current) {
          viewed.current = true;
          recordLocation("location_button_viewed");
        }
        recordLocation("location_button_clicked");
        onLocate();
      }
    }}>
    <option value="" disabled>{label}</option>
    <option value="map">地圖選點（免定位）</option>
    <option value="device" disabled={unsupported}>{unsupported ? "目前位置（瀏覽器不支援）" : current ? "改用目前位置" : "使用目前位置"}</option>
    </select>
  </div>;
}
