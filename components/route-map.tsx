"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { GarbageRoute, GarbageStop } from "@/lib/types";
import { makeMapStyleCompatible } from "@/lib/map-style";
import { createDisplayGeometries, suspiciousStopIds } from "@/lib/route-display";
import { accuracyRingRadii, nearestStopDistanceMeters, ROUTE_FOCUS_LIMIT_METERS, type UserPosition } from "@/lib/user-location";

import MapLocationControl from "./map-location-control";

interface Props {
  route: GarbageRoute | null;
  selectedStop: GarbageStop | null;
  userPosition?: UserPosition | null;
  /** Changes when the stop popup grows or shrinks, so the selected stop is re-aimed at the gap above it. */
  popupLayout?: string;
  onSelectStop: (stop: GarbageStop) => void;
  onMapError: () => void;
}

const USER_LAYERS = ["user-location-accuracy", "user-location-dot"] as const;

function ensureUserLayers(map: MapLibreMap) {
  if (map.getSource("user-location")) return;
  map.addSource("user-location", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  // The accuracy ring is a ground-fixed circle: its pixel radius doubles with every zoom level.
  map.addLayer({
    id: "user-location-accuracy",
    type: "circle",
    source: "user-location",
    filter: ["has", "r0"],
    paint: {
      "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 0, ["get", "r0"], 22, ["get", "r22"]],
      "circle-color": "#2f6fd6",
      "circle-opacity": 0.14,
      "circle-stroke-color": "#2f6fd6",
      "circle-stroke-opacity": 0.4,
      "circle-stroke-width": 1,
      "circle-pitch-alignment": "map",
    },
  });
  map.addLayer({ id: "user-location-dot", type: "circle", source: "user-location", paint: { "circle-radius": 7, "circle-color": "#2f6fd6", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
}

// Route layers may be added after the user dot; keep the dot above them.
function raiseUserLayers(map: MapLibreMap) {
  for (const id of USER_LAYERS) if (map.getLayer(id)) map.moveLayer(id);
}

const TWIN_CITY_BOUNDS: [[number, number], [number, number]] = [[121.30, 24.82], [121.72, 25.22]];
const SELECTED_STOP_RADIUS = 19;

// The stop popup overlays the map; when it covers the map centre, aim the selected stop at the gap above it.
function selectedStopOffset(mapElement: HTMLElement): [number, number] {
  const stage = mapElement.getBoundingClientRect();
  const popup = mapElement.parentElement?.querySelector(".stop-popup")?.getBoundingClientRect();
  const centerX = stage.left + stage.width / 2;
  const centerY = stage.top + stage.height / 2;
  if (!popup || popup.left > centerX || popup.right < centerX || popup.top > centerY + SELECTED_STOP_RADIUS) return [0, 0];
  const badge = mapElement.parentElement?.querySelector(".route-strip")?.getBoundingClientRect();
  return [0, ((badge?.bottom ?? stage.top) + popup.top) / 2 - centerY];
}

// One MapLibre instance per page load. The home and route pages each mount
// their own explorer, so navigating between them unmounts this component;
// rebuilding the map on every navigation refetches the style and tiles and
// shows the user a blank map twice. The instance and its DOM node are kept
// here and re-attached to whichever RouteMap is currently mounted.
interface CachedMap {
  map: MapLibreMap;
  element: HTMLDivElement;
  loaded: boolean;
}

const activeHandlers: { onSelectStop: (stop: GarbageStop) => void; getRoute: () => GarbageRoute | null } = {
  onSelectStop: () => {},
  getRoute: () => null,
};
let cachedMap: CachedMap | null = null;

export default function RouteMap({ route, selectedStop, userPosition = null, popupLayout = "", onSelectStop, onMapError }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const routeRef = useRef(route);
  // A re-adopted map that already fired "load" is usable immediately.
  const [ready, setReady] = useState(() => cachedMap?.loaded ?? false);

  useEffect(() => { routeRef.current = route; }, [route]);

  useEffect(() => {
    const host = wrapper.current;
    if (!host) return;
    activeHandlers.onSelectStop = onSelectStop;
    activeHandlers.getRoute = () => routeRef.current;

    if (cachedMap) {
      const cached = cachedMap;
      host.appendChild(cached.element);
      mapRef.current = cached.map;
      cached.map.resize();
      if (!cached.loaded) cached.map.once("load", () => setReady(true));
      return () => {
        if (cached.element.parentElement === host) host.removeChild(cached.element);
        mapRef.current = null;
      };
    }

    let cancelled = false;
    let created: CachedMap | null = null;
    let loadTimeout: number | undefined;
    const controller = new AbortController();
    const initialize = async () => {
      // MapLibre's inferred worker URL is not preserved by Next's client bundlers.
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
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
      if (cancelled || !wrapper.current) return;
      const element = document.createElement("div");
      element.className = "map-canvas-inner";
      // Inline so MapLibre's own `.maplibregl-map { position: relative }` cannot collapse it.
      element.style.cssText = "position:absolute;inset:0;";
      wrapper.current.appendChild(element);
      const map = new maplibregl.Map({
        container: element,
        style,
        bounds: TWIN_CITY_BOUNDS,
        fitBoundsOptions: { padding: 36 },
        attributionControl: false,
        cooperativeGestures: false,
      });
      created = { map, element, loaded: false };
      cachedMap = created;
      mapRef.current = map;
      loadTimeout = window.setTimeout(() => onMapError(), 15_000);
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.on("load", () => { window.clearTimeout(loadTimeout); created!.loaded = true; if (!cancelled) setReady(true); });
      map.on("click", "route-stops", (event) => {
        const id = event.features?.[0]?.properties?.id;
        const stop = activeHandlers.getRoute()?.stops.find((item) => item.id === id);
        if (stop) activeHandlers.onSelectStop(stop);
      });
      map.on("mouseenter", "route-stops", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "route-stops", () => { map.getCanvas().style.cursor = ""; });
    };
    void initialize();
    return () => {
      cancelled = true;
      controller.abort();
      if (loadTimeout) window.clearTimeout(loadTimeout);
      // Detach rather than destroy: the next RouteMap re-adopts the same map.
      if (created && created.element.parentElement === host) host.removeChild(created.element);
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
      raiseUserLayers(map);
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
      // Frame the user together with the route only when they are close; otherwise the route alone.
      const distance = userPosition ? nearestStopDistanceMeters(userPosition, trustedStops) : null;
      if (userPosition && distance !== null && distance <= ROUTE_FOCUS_LIMIT_METERS) bounds.extend([userPosition.lng, userPosition.lat]);
      map.fitBounds(bounds, { padding: { top: 90, bottom: 90, left: 70, right: 70 }, maxZoom: 16, duration: 700 });
    } else if (userPosition) {
      map.easeTo({ center: [userPosition.lng, userPosition.lat], zoom: Math.max(map.getZoom(), 15), duration: 700 });
    } else {
      map.fitBounds(TWIN_CITY_BOUNDS, { padding: 36 });
    }
  }, [ready, route, userPosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    ensureUserLayers(map);
    raiseUserLayers(map);
    const featureCollection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: userPosition ? [{ type: "Feature", geometry: { type: "Point", coordinates: [userPosition.lng, userPosition.lat] }, properties: accuracyRingRadii(userPosition) ?? {} }] : [],
    };
    (map.getSource("user-location") as GeoJSONSource).setData(featureCollection);
  }, [ready, userPosition]);

  const flyToUser = () => {
    const map = mapRef.current;
    if (!map || !userPosition) return;
    map.easeTo({ center: [userPosition.lng, userPosition.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
  };

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
      map.easeTo({ center: [selectedStop.longitude!, selectedStop.latitude!], zoom: Math.max(map.getZoom(), 15), offset: selectedStopOffset(map.getContainer()), duration: 550 });
    }
  }, [ready, selectedStop, popupLayout]);

  return <>
    <div ref={wrapper} className="map-canvas" aria-label="選中垃圾車路線地圖" />
    {ready && (route || userPosition) && <MapLocationControl route={route} onFocusPosition={flyToUser} />}
  </>;
}
