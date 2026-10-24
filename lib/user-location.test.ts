import { afterEach, describe, expect, it, vi } from "vitest";
import { accuracyRingRadii, clearLocationSession, clearPendingStopFocus, getLocationSession, nearestStopDistanceMeters, peekPendingStopFocus, setLocationSession, setPendingStopFocus, subscribeLocationSession, type LocationSession } from "./user-location";
import type { GarbageStop } from "./types";

const session: LocationSession = {
  position: { lat: 25, lng: 121.5, accuracy: 20, locatedAt: 1 },
  nearby: { radius: 500, expanded: false, resolved: { city: "NTP", district: "永和區", districtSlug: "yonghe" }, routes: [] },
};

function stop(sequence: number, latitude: number | null, longitude: number | null, coordinateStatus: GarbageStop["coordinateStatus"] = "valid"): GarbageStop {
  return {
    id: `stop-${sequence}`, routeId: "route", sequence, name: `第 ${sequence} 站`, address: null, village: null,
    longitude, latitude, arrivalTime: null, departureTime: null, serviceDayOffset: 0, memo: null, schedule: null, coordinateStatus,
  };
}

afterEach(() => clearLocationSession());

describe("location session store", () => {
  it("設定、清除時通知訂閱者，取消訂閱後不再通知", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLocationSession(listener);
    setLocationSession(session);
    expect(getLocationSession()).toBe(session);
    clearLocationSession();
    expect(getLocationSession()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setLocationSession(session);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("pending stop focus", () => {
  it("只回傳目標路線的聚焦站，讀取不會清除，清除後為 null", () => {
    setPendingStopFocus({ routeId: "r1", stopId: "s7", showDetails: true });
    expect(peekPendingStopFocus("r1")).toEqual({ routeId: "r1", stopId: "s7", showDetails: true });
    expect(peekPendingStopFocus("r1")).not.toBeNull();
    expect(peekPendingStopFocus("r2")).toBeNull();
    clearPendingStopFocus();
    expect(peekPendingStopFocus("r1")).toBeNull();
  });
});

describe("nearestStopDistanceMeters", () => {
  it("取最近的有效站點距離，忽略無法定位的站", () => {
    const position = { lat: 25, lng: 121.5, accuracy: null, locatedAt: 0 };
    const stops = [stop(1, 25.01, 121.5), stop(2, 25.001, 121.5), stop(3, 25.0001, 121.5, "invalid"), stop(4, null, null, "missing")];
    expect(nearestStopDistanceMeters(position, stops)).toBeCloseTo(111.2, 0);
    expect(nearestStopDistanceMeters(position, [stop(4, null, null, "missing")])).toBeNull();
  });
});

describe("accuracyRingRadii", () => {
  it("誤差未知或小於 30 公尺時不畫圈", () => {
    expect(accuracyRingRadii({ lat: 25, lng: 121.5, accuracy: null, locatedAt: 0 })).toBeNull();
    expect(accuracyRingRadii({ lat: 25, lng: 121.5, accuracy: 29, locatedAt: 0 })).toBeNull();
  });

  it("依緯度換算成 zoom 0 與 zoom 22 的像素半徑，之間以 2 的指數插值", () => {
    const radii = accuracyRingRadii({ lat: 25, lng: 121.5, accuracy: 100, locatedAt: 0 });
    expect(radii).not.toBeNull();
    // At zoom 16 one pixel is ~1.08 m at 25°N, so 100 m is ~92 px.
    expect(radii!.r0 * 2 ** 16).toBeCloseTo(92.4, 0);
    expect(radii!.r22).toBeCloseTo(radii!.r0 * 2 ** 22, 6);
  });
});
