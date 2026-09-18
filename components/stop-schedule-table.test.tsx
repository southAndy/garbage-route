import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StopScheduleTable from "./stop-schedule-table";
import type { GarbageStop } from "../lib/types";

const stop: GarbageStop = {
  id: "first", routeId: "route", sequence: 1, name: "第一站", address: null, village: null,
  longitude: null, latitude: null, arrivalTime: null, departureTime: null,
  serviceDayOffset: 0, memo: null, schedule: null, coordinateStatus: "missing",
};

describe("完整清運表的初始 HTML", () => {
  it("不需選取第二站或執行 JavaScript 就能讀取地址、次日時間與各類清運日", () => {
    const html = renderToStaticMarkup(<StopScheduleTable onSelectStop={() => {}} stops={[
      stop,
      { ...stop, id: "second", sequence: 2, name: "第二站", address: "新北市新店區測試路 2 號",
        arrivalTime: "00:10", departureTime: "00:15", serviceDayOffset: 1,
        memo: "請於路口等候", schedule: {
          garbage: [false, true, false, true, false, true, false],
          recycling: [false, false, true, false, true, false, false],
          foodScraps: [true, false, false, false, false, false, true],
        } },
    ]} />);
    for (const text of ["新北市新店區測試路 2 號", "00:10（次日）", "00:15（次日）", "週一、週三、週五", "週二、週四", "週日、週六", "請於路口等候"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('<th scope="col">一般垃圾</th>');
  });

  it("缺少資料時不推測清運日或時間", () => {
    const html = renderToStaticMarkup(<StopScheduleTable stops={[stop]} onSelectStop={() => {}} />);
    expect(html).toContain("地址未提供");
    expect(html.match(/未提供清運日/g)).toHaveLength(3);
    expect(html.match(/時間未提供/g)).toHaveLength(2);
    expect(html).not.toContain("週一");
  });
});
