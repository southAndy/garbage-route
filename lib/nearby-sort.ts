import type { NearbySort } from "./stop-timing";

const KEY = "nearby-sort";

/**
 * The user's last nearby-list ordering. Someone who always waits for the truck
 * nearest home picks "distance" once and keeps it; everyone else gets "time".
 * Storage may be missing or blocked, so both directions swallow failures.
 */
export function readNearbySort(): NearbySort {
  try {
    if (typeof window === "undefined") return "time";
    return window.localStorage.getItem(KEY) === "distance" ? "distance" : "time";
  } catch {
    return "time";
  }
}

export function writeNearbySort(sort: NearbySort) {
  try {
    window.localStorage.setItem(KEY, sort);
  } catch {
    // Private mode or blocked storage: the choice still applies for this visit.
  }
}
