"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { GarbageRoute, GarbageStop } from "@/lib/types";
import { makeMapStyleCompatible } from "@/lib/map-style";
import { createDisplayGeometries, suspiciousStopIds } from "@/lib/route-display";

interface Props {
  route: GarbageRoute | null;
  selectedStop: GarbageStop | null;
  onSelectStop: (stop: GarbageStop) => void;
  onMapError: () => void;
}

const TWIN_CITY_BOUNDS: [[number, number], [number, number]] = [[121.30, 24.82], [121.72, 25.22]];

export default function RouteMap({ route, selectedStop, onSelectStop, onMapError }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const routeRef = useRef(route);
  const [ready, setReady] = useState(false);

  useEffect(() => { routeRef.current = route; }, [route]);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let loadTimeout: number | undefined;
    const controller = new AbortController();
    const initialize = async () => {
      const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";
      let style: string | StyleSpecification = styleUrl;
      try {
        const response = await fetch(styleUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`Map style HTTP ${response.status}`);
        style = makeMapStyleCompatible(await response.json() as StyleSpecification);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("無法預先處理底圖樣式，改由 MapLibre 直接載入。", error);
      }
      if (cancelled || !container.current) return;
      map = new maplibregl.Map({
        container: container.current,
        style,
        bounds: TWIN_CITY_BOUNDS,
        fitBoundsOptions: { padding: 36 },
        attributionControl: false,
      });
      loadTimeout = window.setTimeout(() => onMapError(), 15_000);
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.on("load", () => { window.clearTimeout(loadTimeout); setReady(true); });
      map.on("click", "route-stops", (event) => {
        const id = event.features?.[0]?.properties?.id;
        const stop = routeRef.current?.stops.find((item) => item.id === id);
        if (stop) onSelectStop(stop);
      });
      map.on("mouseenter", "route-stops", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "route-stops", () => { if (map) map.getCanvas().style.cursor = ""; });
      mapRef.current = map;
    };
    void initialize();
    return () => {
      cancelled = true;
      controller.abort();
      if (loadTimeout) window.clearTimeout(loadTimeout);
      map?.remove();
      mapRef.current = null;
    };
  }, [onMapError, onSelectStop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const validStops = route?.stops.filter((stop) => stop.coordinateStatus === "valid") ?? [];
    const suspiciousIds = suspiciousStopIds(route);
    const trustedStops = validStops.filter((stop) => !suspiciousIds.has(stop.id));
    const points: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: validStops.map((stop, index) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [stop.longitude!, stop.latitude!] },
        properties: {
          id: stop.id,
          sequence: stop.sequence,
          suspicious: suspiciousIds.has(stop.id),
          kind: index === 0 ? "start" : index === validStops.length - 1 ? "end" : "middle",
        },
      })),
    };
    const displayGeometries = createDisplayGeometries(route);
    const line: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: displayGeometries.normal ? [{ type: "Feature", geometry: displayGeometries.normal, properties: {} }] : [],
    };
    const suspiciousLine: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: displayGeometries.suspicious ? [{ type: "Feature", geometry: displayGeometries.suspicious, properties: {} }] : [],
    };
    if (!map.getSource("route-line")) {
      map.addSource("route-line", { type: "geojson", data: line });
      map.addLayer({ id: "route-outline", type: "line", source: "route-line", paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 } });
      map.addLayer({ id: "route-main", type: "line", source: "route-line", paint: { "line-color": "#1f6b50", "line-width": 5 } });
      map.addSource("route-suspicious-line", { type: "geojson", data: suspiciousLine });
      map.addLayer({ id: "route-suspicious-outline", type: "line", source: "route-suspicious-line", paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 } });
      map.addLayer({ id: "route-suspicious-main", type: "line", source: "route-suspicious-line", paint: { "line-color": "#d98b20", "line-width": 5, "line-dasharray": [1.4, 1.2] } });
      map.addSource("route-stops", { type: "geojson", data: points });
      map.addLayer({
        id: "route-stops",
        type: "circle",
        source: "route-stops",
        paint: {
          "circle-radius": ["case", ["get", "suspicious"], 11, ["==", ["get", "kind"], "middle"], 7, 11],
          "circle-color": ["case", ["get", "suspicious"], "#f5b840", ["match", ["get", "kind"], "start", "#1f6b50", "end", "#d34a32", "#fffaf1"]],
          "circle-stroke-color": ["case", ["get", "suspicious"], "#7b5a0f", ["match", ["get", "kind"], "end", "#8e2f20", "#1f6b50"]],
          "circle-stroke-width": ["case", ["get", "suspicious"], 4, 3],
        },
      });
      map.addLayer({
        id: "stop-labels",
        type: "symbol",
        source: "route-stops",
        minzoom: 13,
        layout: { "text-field": ["case", ["get", "suspicious"], "?", ["to-string", ["get", "sequence"]]], "text-size": 11, "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": "#173c30" },
      });
      map.addSource("selected-stop", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-stop", type: "circle", source: "selected-stop", paint: { "circle-radius": 15, "circle-color": "#f5b840", "circle-stroke-color": "#173c30", "circle-stroke-width": 4 } });
    } else {
      (map.getSource("route-line") as GeoJSONSource).setData(line);
      (map.getSource("route-suspicious-line") as GeoJSONSource).setData(suspiciousLine);
      (map.getSource("route-stops") as GeoJSONSource).setData(points);
    }
    if (trustedStops.length) {
      const bounds = trustedStops.reduce(
        (box, stop) => box.extend([stop.longitude!, stop.latitude!]),
        new maplibregl.LngLatBounds([trustedStops[0].longitude!, trustedStops[0].latitude!], [trustedStops[0].longitude!, trustedStops[0].latitude!]),
      );
      map.fitBounds(bounds, { padding: { top: 90, bottom: 90, left: 70, right: 70 }, maxZoom: 16, duration: 700 });
    } else {
      map.fitBounds(TWIN_CITY_BOUNDS, { padding: 36 });
    }
  }, [ready, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource("selected-stop")) return;
    const featureCollection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: selectedStop?.coordinateStatus === "valid" ? [{
        type: "Feature",
        geometry: { type: "Point", coordinates: [selectedStop.longitude!, selectedStop.latitude!] },
        properties: {},
      }] : [],
    };
    (map.getSource("selected-stop") as GeoJSONSource).setData(featureCollection);
    if (selectedStop?.coordinateStatus === "valid") {
      map.easeTo({ center: [selectedStop.longitude!, selectedStop.latitude!], zoom: Math.max(map.getZoom(), 15), duration: 550 });
    }
  }, [ready, selectedStop]);

  return <div ref={container} className="map-canvas" aria-label="選中垃圾車路線地圖" />;
}
