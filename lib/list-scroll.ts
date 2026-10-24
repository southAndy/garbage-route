/** Scroll offsets of the search panel and its route list, per result set. */
export interface ListScroll { panel: number; list: number }

// Module-level so a position survives the remount between the home and route
// pages (see user-location.ts); it lives only in this page load.
const positions = new Map<string, ListScroll>();

export function saveListScroll(key: string, position: ListScroll) { positions.set(key, position); }

export function readListScroll(key: string): ListScroll | null { return positions.get(key) ?? null; }

export function clearListScroll() { positions.clear(); }
