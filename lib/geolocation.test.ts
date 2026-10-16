import { describe, expect, it } from "vitest";
import { formatDistance, locateErrorState, locateMessage, locationDeniedHint, roundForRequest } from "./geolocation";

const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const LINE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Line/14.0.0";
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36";

describe("locateErrorState", () => {
  it("對應 GeolocationPositionError 的三種代碼", () => {
    expect(locateErrorState(1)).toBe("denied");
    expect(locateErrorState(2)).toBe("unavailable");
    expect(locateErrorState(3)).toBe("timeout");
    expect(locateErrorState(99)).toBe("failed");
  });
});

describe("locationDeniedHint", () => {
  it("LINE 內建瀏覽器優先於 iOS 的判斷", () => {
    expect(locationDeniedHint(LINE_UA)).toContain("LINE");
    expect(locationDeniedHint(LINE_UA)).toContain("Safari 或 Chrome");
  });

  it("iOS 指向 Safari 設定，桌機指向網址列圖示", () => {
    expect(locationDeniedHint(IOS_UA)).toContain("設定 › Safari › 位置");
    expect(locationDeniedHint(DESKTOP_UA)).toContain("網址列左側");
  });
});

describe("locateMessage", () => {
  it("只有錯誤狀態有訊息，且不使用即時定位的字眼", () => {
    expect(locateMessage("idle")).toBeNull();
    expect(locateMessage("locating")).toBeNull();
    expect(locateMessage("ready")).toBeNull();
    for (const state of ["unsupported", "denied", "unavailable", "timeout", "outOfArea", "failed"] as const) {
      const message = locateMessage(state, DESKTOP_UA);
      expect(message).toBeTruthy();
      expect(message).not.toContain("即將");
    }
  });
});

describe("formatDistance / roundForRequest", () => {
  it("公尺與公里的顯示", () => {
    expect(formatDistance(22.4)).toBe("22 公尺");
    expect(formatDistance(999)).toBe("999 公尺");
    expect(formatDistance(1250)).toBe("1.3 公里");
  });

  it("送出前先四捨五入到小數第三位", () => {
    expect(roundForRequest(25.03374567)).toBe(25.034);
  });
});
