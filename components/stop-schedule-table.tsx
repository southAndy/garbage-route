import type { GarbageStop } from "../lib/types";
import { displayTime, scheduleText } from "../lib/schedule-display";

export default function StopScheduleTable({ stops, onSelectStop }: {
  stops: GarbageStop[];
  onSelectStop: (stop: GarbageStop) => void;
}) {
  return (
    <div className="stop-details" role="region" aria-label="各站清運資訊，可左右捲動" tabIndex={0}>
      <table className="stop-details-table">
        <caption>各站地址與清運星期<span>以下皆為臺灣時間的表定資訊；假日或臨時調整請以清潔隊公告為準。</span></caption>
        <thead><tr>
          <th scope="col">停靠點／地址</th>
          <th scope="col">抵達／離開</th>
          <th scope="col">一般垃圾</th>
          <th scope="col">資源回收</th>
          <th scope="col">廚餘</th>
        </tr></thead>
        <tbody>{stops.map((stop) => (
          <tr key={stop.id}>
            <th scope="row">
              <button type="button" onClick={() => onSelectStop(stop)} aria-label={`查看第 ${stop.sequence} 站 ${stop.name} 的地圖位置`}>
                {stop.sequence}. {stop.name}
              </button>
              <span className="stop-detail-address">{stop.address || "地址未提供"}{stop.village ? `・${stop.village}` : ""}</span>
              {stop.memo && <span className="stop-detail-note">{stop.memo}</span>}
            </th>
            <td><span>抵達 {displayTime(stop)}</span><span>離開 {displayTime(stop, "departureTime")}</span></td>
            <td>{scheduleText(stop.schedule?.garbage)}</td>
            <td>{scheduleText(stop.schedule?.recycling)}</td>
            <td>{scheduleText(stop.schedule?.foodScraps)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
