import { useSyncExternalStore } from "react";
import { haversineMeters, type NearbyResult } from "./nearby-search";
import type { GarbageStop } from "./types";

export interface UserPosition {
  lat: number;
  lng: number;
  /** Metres, as reported by the device; null when unknown. */
  accuracy: number | null;
  locatedAt: number;
}

/** A location fix, optionally accompanied by a nearby-route search result. */
export interface LocationSession {
  position: UserPosition;
  nearby: NearbyResult | null;
}

/** Show the user's dot together with a route only when they are this close to it; otherwise frame the route alone. */
export const ROUTE_FOCUS_LIMIT_METERS = 2000;
/** Below this reported error the accuracy ring would be smaller than the dot, so only the dot is drawn. */
export const ACCURACY_CIRCLE_MIN_METERS = 30;
/** Above this reported error the nearby list carries a warning that results are approximate. */
export const ACCURACY_WARNING_METERS = 500;

// MapLibre's world is 512 px wide at zoom 0, so one pixel spans this many metres at the equator.
const METERS_PER_PIXEL_AT_ZOOM_0 = 40075016.686 / 512;

/**
 * Pixel radius of the accuracy ring at zoom 0 and zoom 22, for a MapLibre
 * `interpolate exponential 2` expression that keeps the ring a fixed size on
 * the ground. Null when the error is unknown or too small to be worth drawing.
 */
export function accuracyRingRadii(position: UserPosition): { r0: number; r22: number } | null {
  if (position.accuracy === null || !Number.isFinite(position.accuracy) || position.accuracy < ACCURACY_CIRCLE_MIN_METERS) return null;
  const metersPerPixel = METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((position.lat * Math.PI) / 180);
  const r0 = position.accuracy / metersPerPixel;
  return { r0, r22: r0 * 2 ** 22 };
}

// Module-level so the session survives client-side navigation between the home
// and route pages, but lives only in this page load: never in the URL or storage.
let current: LocationSession | null = null;
const listeners = new Set<() => void>();

export function getLocationSession() { return current; }

export function setLocationSession(session: LocationSession | null) {
  current = session;
  listeners.forEach((listener) => listener());
}

export function clearLocationSession() { setLocationSession(null); }

export function subscribeLocationSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getServerSnapshot = () => null;

export function useLocationSession() {
  return useSyncExternalStore(subscribeLocationSession, getLocationSession, getServerSnapshot);
}

/** The stop a route should open on, chosen before navigating into that route's page. */
export interface StopFocus { routeId: string; stopId: string; showDetails: boolean }

// Opening a route from the home page swaps in a different page component, so the
// explorer remounts and would otherwise land on stop 1. The focus is kept here across
// that remount; the explorer reads it during mount and clears it once mounted.
let pendingFocus: StopFocus | null = null;

export function setPendingStopFocus(focus: StopFocus | null) { pendingFocus = focus; }

/** The pending focus when it targets this route; null otherwise. Does not clear it. */
export function peekPendingStopFocus(routeId: string): StopFocus | null {
  return pendingFocus?.routeId === routeId ? pendingFocus : null;
}

export function clearPendingStopFocus() { pendingFocus = null; }

/** Distance from the position to the closest stop, or null when none has usable coordinates. */
export function nearestStopDistanceMeters(position: UserPosition, stops: GarbageStop[]): number | null {
  let nearest: number | null = null;
  for (const stop of stops) {
    if (stop.coordinateStatus !== "valid" || stop.latitude === null || stop.longitude === null) continue;
    const distance = haversineMeters(position, { lat: stop.latitude, lng: stop.longitude });
    if (nearest === null || distance < nearest) nearest = distance;
  }
  return nearest;
}
