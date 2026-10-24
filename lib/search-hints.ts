/**
 * Two one-time flags for the search panel, kept in localStorage so they survive visits.
 * Storage may be missing or blocked, so every call swallows failures and the panel simply
 * shows the hint again.
 */
const EXPLAINER_SEEN_KEY = "locate-explainer-seen";
const NEARBY_HINT_DISMISSED_KEY = "nearby-hint-dismissed";

function readFlag(key: string) {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Private mode or blocked storage: the flag holds for this visit only.
  }
}

/** The user has read the pre-permission card and asked to locate once; Safari has no Permissions API to tell us "granted". */
export function hasSeenLocateExplainer() { return readFlag(EXPLAINER_SEEN_KEY); }
export function markLocateExplainerSeen() { writeFlag(EXPLAINER_SEEN_KEY); }

export function isNearbyHintDismissed() { return readFlag(NEARBY_HINT_DISMISSED_KEY); }
export function dismissNearbyHint() { writeFlag(NEARBY_HINT_DISMISSED_KEY); }
