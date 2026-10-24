import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SearchRouteCard from "./search-route-card";
import type { RouteSummary } from "../lib/types";

const days = [false, true, true, false, true, true, true];
const item: RouteSummary = {
  id: "ntp-234007", cityCode: "NTP", district: "永和區", districtSlug: "yonghe", routeName: "四區午13", tripLabel: null,
  firstArrivalTime: "12:42", lastArrivalTime: "14:17", startStopName: "起點", endStopName: "終點", stopCount: 46,
  matches: { count: 7, stops: [
    { stopId: "s1", sequence: 1, name: "永平路206巷口", scheduledTime: "13:01", serviceDayOffset: 0, serviceDays: days },
    { stopId: "s2", sequence: 2, name: "永平路218巷口", scheduledTime: "13:31", serviceDayOffset: 0, serviceDays: days },
    { stopId: "s3", sequence: 3, name: "永平路220號", scheduledTime: "13:32", serviceDayOffset: 0, serviceDays: days },
    { stopId: "s4", sequence: 4, name: "中山路一段永平路口", scheduledTime: "13:33", serviceDayOffset: 0, serviceDays: days },
    { stopId: "s5", sequence: 5, name: "永平路226巷口", scheduledTime: "13:40", serviceDayOffset: 0, serviceDays: days },
    { stopId: "s6", sequence: 6, name: "永平路230號", scheduledTime: "13:42", serviceDayOffset: 0, serviceDays: days },
    { stopId: "s7", sequence: 7, name: "永平路240巷口", scheduledTime: "13:45", serviceDayOffset: 0, serviceDays: days },
  ] },
};
const satNoon = { weekday: 6, minutes: 13 * 60 + 5 };

describe("SearchRouteCard", () => {
  it("沒有時鐘時從第一個匹配站點列出五站、加粗關鍵字並點出其餘站數", () => {
    const html = renderToStaticMarkup(<SearchRouteCard item={item} query="永平路" />);
    for (const text of ["四區午13", "<mark>永平路</mark>206巷口", "13:01", "13:40", "「永平路」上另有 2 站", "全線 12:42—14:17", "共 46 站"]) expect(html).toContain(text);
    expect(html).not.toContain("13:42");
    for (const id of ["s1", "s2", "s3", "s4", "s5"]) expect(html).toContain(`data-stop-id="${id}"`);
  });

  it("有時鐘與 timing 時從第一個還沒到的站開始列，並顯示抵達狀態", () => {
    const html = renderToStaticMarkup(<SearchRouteCard item={item} query="永平路" clock={satNoon} timing={{ status: "upcoming", nextIndex: 1, minutesUntilNext: 26 }} fastest />);
    expect(html).toContain("最快・約 26 分後・13:31");
    expect(html).toContain("is-next");
    expect(html).not.toContain("13:01");
    expect(html).toContain("中山路一段<mark>永平路</mark>口");
    expect(html).toContain("13:42");
    expect(html).not.toContain("13:45");
    expect(html).toContain("「永平路」上另有 2 站");
  });

  it("兩小時以上改以小時描述", () => {
    const html = renderToStaticMarkup(<SearchRouteCard item={item} query="永平路" clock={{ weekday: 6, minutes: 9 * 60 }} timing={{ status: "upcoming", nextIndex: 0, minutesUntilNext: 241 }} />);
    expect(html).toContain("約 4 小時後・13:01");
  });

  it("全部已過時標示已過表定時間，站點時間畫掉", () => {
    const html = renderToStaticMarkup(<SearchRouteCard item={item} query="永平路" clock={{ weekday: 6, minutes: 15 * 60 }} timing={{ status: "passed", nextIndex: -1, minutesUntilNext: null }} />);
    expect(html).toContain("route-status is-passed");
    expect(html).toContain('class="status-passed"');
  });

  it("只有路線名稱符合時說明原因，不列站點", () => {
    const html = renderToStaticMarkup(<SearchRouteCard item={{ ...item, matches: { count: 0, stops: [] } }} query="午13" />);
    expect(html).toContain("路線名稱符合「午13」");
    expect(html).not.toContain("matched-stops");
  });
});
