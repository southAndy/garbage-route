import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NearbyRouteCard from "./nearby-route-card";
import type { NearbyRoute } from "../lib/nearby-search";

const item: NearbyRoute = {
  id: "ntp-1", cityCode: "NTP", district: "永和區", districtSlug: "yonghe", routeName: "三區晚 9", tripLabel: null,
  firstArrivalTime: "18:00", lastArrivalTime: "20:30", startStopName: "起點", endStopName: "終點", stopCount: 45,
  nearby: {
    count: 5, nearestDistanceMeters: 22, firstTime: "19:10", lastTime: "19:25",
    stops: [
      { stopId: "s1", name: "文化路 20 號附近", scheduledTime: "19:10", serviceDayOffset: 0, distanceMeters: 22, serviceDays: null },
      { stopId: "s2", name: "文化路 80 號附近", scheduledTime: "19:18", serviceDayOffset: 0, distanceMeters: 140, serviceDays: null },
      { stopId: "s3", name: "文化路 120 號附近", scheduledTime: "00:05", serviceDayOffset: 1, distanceMeters: 1200, serviceDays: null },
    ],
    firstTimeOffset: 0, lastTimeOffset: 1, serviceDays: null,
  },
};

describe("NearbyRouteCard", () => {
  it("顯示最近距離、附近站點時間範圍、每站距離與次日標記，並點出未預覽的站數", () => {
    const html = renderToStaticMarkup(<NearbyRouteCard item={item} />);
    for (const text of ["三區晚 9", "最近 22 公尺", "附近站點表定時間", "19:10", "19:25", "文化路 20 號附近", "140 公尺", "1.2 公里", "00:05（次日）", "範圍內另有 2 站", "永和區・全線 18:00—20:30", "共 45 站"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("即將");
  });

  it("給定時鐘時標示已過表定時間的站點，沒有時鐘時不標示", () => {
    const clock = { weekday: 4, minutes: 19 * 60 + 15 };
    const html = renderToStaticMarkup(<NearbyRouteCard item={item} clock={clock} timing={{ status: "upcoming", minutesUntilNext: 3 }} />);
    expect(html).toContain("已過表定時間");
    expect(html).toContain('class="status-passed"');
    expect((html.match(/已過表定時間/g) ?? []).length).toBe(1);
    const passedRoute = renderToStaticMarkup(<NearbyRouteCard item={item} clock={{ weekday: 4, minutes: 23 * 60 }} timing={{ status: "passed", minutesUntilNext: null }} />);
    expect(passedRoute).toContain('class="stop-status status-passed"');
    expect(renderToStaticMarkup(<NearbyRouteCard item={item} />)).not.toContain("已過表定時間");
  });

  it("每個站點列都帶 data-stop-id，讓卡片點擊能定位到該站", () => {
    const html = renderToStaticMarkup(<NearbyRouteCard item={item} />);
    for (const id of ["s1", "s2", "s3"]) expect(html).toContain(`data-stop-id="${id}"`);
    expect(html).not.toContain('class="nearby-more" data-stop-id');
  });

  it("只有一站時不顯示時間區間", () => {
    const single: NearbyRoute = { ...item, nearby: { ...item.nearby, count: 1, stops: item.nearby.stops.slice(0, 1), firstTime: "19:10", lastTime: "19:10" } };
    const html = renderToStaticMarkup(<NearbyRouteCard item={single} />);
    expect(html).toContain("19:10");
    expect(html).not.toContain("<em>—</em>");
    expect(html).not.toContain("範圍內另有");
  });
});
