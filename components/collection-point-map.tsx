"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { makeMapStyleCompatible } from "@/lib/map-style";
import { hasCollectionPointCoordinates } from "@/lib/collection-point-view";
import type { CollectionPoint } from "@/lib/collection-points";

interface Props {
  points: CollectionPoint[];
  selectedId: string | null;
  position: { lat: number; lng: number } | null;
  onSelect: (id: string) => void;
}

export default function CollectionPointMap({ points, selectedId, position, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const onSelectRef = useRef(onSelect);
  const [attempt, setAttempt] = useState(0);
  const [loadedAttempt, setLoadedAttempt] = useState<number | null>(null);
  const [failedAttempt, setFailedAttempt] = useState<number | null>(null);
  const ready = loadedAttempt === attempt;
  const failed = failedAttempt === attempt;

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!container.current) return;
    const host = container.current;
    const controller = new AbortController();
    let disposed = false;
    let map: MapLibreMap | null = null;
    let observer: ResizeObserver | undefined;
    const timeout = window.setTimeout(() => {
      controller.abort();
      setFailedAttempt(attempt);
    }, 15_000);
    async function initialize() {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";
      let style: string | StyleSpecification = styleUrl;
      try {
        const response = await fetch(styleUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`Map style HTTP ${response.status}`);
        style = makeMapStyleCompatible(await response.json() as StyleSpecification);
      } catch {
        if (controller.signal.aborted) return;
        // MapLibre can still attempt its normal style loader if preloading failed.
      }
      if (disposed) return;
      map = new maplibregl.Map({
        container: host, style, center: [121.54, 25.06], zoom: 11,
        attributionControl: false, cooperativeGestures: false,
        locale: { "NavigationControl.ZoomIn": "放大地圖", "NavigationControl.ZoomOut": "縮小地圖" },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.on("load", () => {
        window.clearTimeout(timeout);
        if (!disposed) { map?.resize(); setFailedAttempt(null); setLoadedAttempt(attempt); }
      });
      observer = new ResizeObserver(() => map?.resize());
      observer.observe(host);
    }
    void initialize().catch(() => {
      window.clearTimeout(timeout);
      if (!disposed) setFailedAttempt(attempt);
    });
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timeout);
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const currentMarkers = markers.current;
    const valid = points.filter(hasCollectionPointCoordinates);
    for (const [index, point] of valid.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "collection-marker";
      button.textContent = String(index + 1);
      button.setAttribute("aria-label", `在地圖選取：${point.name}`);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => onSelectRef.current(point.id));
      const marker = new maplibregl.Marker({ element: button }).setLngLat([point.longitude, point.latitude]).addTo(map);
      currentMarkers.set(point.id, marker);
    }
    if (valid.length) {
      const bounds = new maplibregl.LngLatBounds();
      for (const point of valid) bounds.extend([point.longitude, point.latitude]);
      map.fitBounds(bounds, { padding: 54, maxZoom: 14.5, duration: 0 });
    }
    return () => {
      for (const marker of currentMarkers.values()) marker.remove();
      currentMarkers.clear();
    };
  }, [points, ready]);

  useEffect(() => {
    if (!ready) return;
    for (const [id, marker] of markers.current) {
      const active = id === selectedId;
      marker.getElement().classList.toggle("is-selected", active);
      marker.getElement().setAttribute("aria-pressed", String(active));
    }
    const selected = points.find((point) => point.id === selectedId);
    const map = mapRef.current;
    if (map && selected && hasCollectionPointCoordinates(selected)) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      map.easeTo({ center: [selected.longitude, selected.latitude], zoom: Math.max(map.getZoom(), 15), duration: reducedMotion ? 0 : 250 });
    }
  }, [selectedId, points, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !position) return;
    const dot = document.createElement("span");
    dot.className = "collection-user-dot";
    dot.setAttribute("role", "img");
    dot.setAttribute("aria-label", "目前位置");
    const marker = new maplibregl.Marker({ element: dot }).setLngLat([position.lng, position.lat]).addTo(map);
    return () => { marker.remove(); };
  }, [position, ready]);

  return <div className="collection-map-frame">
    <div ref={container} className="collection-map-canvas" aria-label="限時收受點地圖" />
    {!ready && !failed && <p className="collection-map-message" role="status">正在準備收受點地圖…</p>}
    {failed && <div className="collection-map-message" role="status">
      <strong>暫時無法顯示地圖</strong>
      <p>仍可切換列表查看收受時段與導航。</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>重新載入地圖</button>
    </div>}
  </div>;
}
