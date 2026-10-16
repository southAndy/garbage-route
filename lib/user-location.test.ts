import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLocationSession, getLocationSession, nearestStopDistanceMeters, setLocationSession, subscribeLocationSession, type LocationSession } from "./user-location";
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

describe("nearestStopDistanceMeters", () => {
  it("取最近的有效站點距離，忽略無法定位的站", () => {
    const position = { lat: 25, lng: 121.5, accuracy: null, locatedAt: 0 };
    const stops = [stop(1, 25.01, 121.5), stop(2, 25.001, 121.5), stop(3, 25.0001, 121.5, "invalid"), stop(4, null, null, "missing")];
    expect(nearestStopDistanceMeters(position, stops)).toBeCloseTo(111.2, 0);
    expect(nearestStopDistanceMeters(position, [stop(4, null, null, "missing")])).toBeNull();
  });
});
