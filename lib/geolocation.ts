import { COORDINATE_DECIMALS } from "./nearby-search";

export type LocateState =
  | "idle"
  | "locating"
  | "ready"
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "outOfArea"
  | "failed";

export type GeolocationPermission = PermissionState | "unsupported";

/** Maps GeolocationPositionError.code to a UI state; anything unknown is a generic failure. */
export function locateErrorState(code: number): LocateState {
  switch (code) {
    case 1: return "denied";
    case 2: return "unavailable";
    case 3: return "timeout";
    default: return "failed";
  }
}

/** Where to re-enable location once the browser has remembered a refusal. Keyed off the UA only to pick wording. */
export function locationDeniedHint(userAgent: string) {
  if (/\bLine\//i.test(userAgent)) {
    return "LINE 內建瀏覽器無法穩定提供定位，建議以 Safari 或 Chrome 開啟此頁。";
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return "瀏覽器已封鎖定位。請到「設定 › Safari › 位置」或網址列的「大小」選單 › 網站設定，將位置改為允許。";
  }
  return "瀏覽器已封鎖定位。請點網址列左側的鎖頭或設定圖示，將「位置」改為允許後再試一次。";
}

export function locateMessage(state: LocateState, userAgent = ""): string | null {
  switch (state) {
    case "unsupported": return "此瀏覽器不支援定位，請改用手動搜尋。";
    case "denied": return locationDeniedHint(userAgent);
    case "unavailable": return "目前無法取得位置，請確認裝置已開啟定位服務，或改用手動搜尋。";
    case "timeout": return "定位逾時，請再試一次或改用手動搜尋。";
    case "outOfArea": return "目前位置不在臺北市或新北市的服務範圍，請改用手動搜尋。";
    case "failed": return "附近路線查詢失敗，請稍後再試。";
    default: return null;
  }
}

export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} 公尺`;
  return `${(meters / 1000).toFixed(1)} 公里`;
}

/** Round client-side too so the exact fix never leaves the device. */
export function roundForRequest(value: number) {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

export const GEOLOCATION_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 };

/** Reads the current permission without prompting; resolves to "prompt" when the Permissions API is missing. */
export async function queryGeolocationPermission(): Promise<GeolocationPermission> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "prompt";
  }
}
