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

/** One "use my location" result: the fix for the map marker and the nearby routes it produced. */
export interface LocationSession {
  position: UserPosition;
  nearby: NearbyResult;
}

/** Show the user's dot together with a route only when they are this close to it; otherwise frame the route alone. */
export const ROUTE_FOCUS_LIMIT_METERS = 2000;

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
