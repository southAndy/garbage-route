import type { RouteSummary } from "../lib/types";
import { splitByQuery } from "../lib/route-search";
import { classifyStopTime, stopStatusLabel, type SearchRouteTiming, type TaipeiClock } from "../lib/stop-timing";

/** Matched stops shown on a card; the rest are counted. */
export const SEARCH_STOP_PREVIEW_LIMIT = 5;

function stopTime(stop: { scheduledTime: string | null; serviceDayOffset: number }) {
  if (!stop.scheduledTime) return "時間未提供";
  return `${stop.scheduledTime}${stop.serviceDayOffset ? "（次日）" : ""}`;
}

function Highlight({ text, query }: { text: string; query: string }) {
  return <>{splitByQuery(text, query).map((part, index) => index % 2 === 1 ? <mark key={index}>{part}</mark> : part)}</>;
}

function statusPill(timing: SearchRouteTiming | undefined, nextTime: string | null, fastest: boolean) {
  if (!timing) return null;
  if (timing.status === "upcoming") {
    const minutes = timing.minutesUntilNext;
    const when = minutes === null ? null : minutes <= 1 ? "即將到達" : minutes >= 120 ? `約 ${Math.round(minutes / 60)} 小時後` : `約 ${minutes} 分後`;
    const text = [fastest ? "最快" : null, when, nextTime].filter(Boolean).join("・");
    return text ? <span className={`route-status ${fastest ? "is-next" : "is-upcoming"}`}>{text}</span> : null;
  }
  const label = stopStatusLabel(timing.status);
  return label ? <span className={`route-status is-${timing.status}`}>{label}</span> : null;
}

/**
 * Body of a text-search result card. Leads with the stops on the searched street and when
 * the truck reaches them, starting from the first one still ahead; the whole-route span is
 * demoted to the footer. Stop rows carry `data-stop-id` like nearby cards, so a tap on a
 * row opens the route focused on that stop.
 */
export default function SearchRouteCard({ item, query: requestedQuery, clock, timing, fastest = false }: { item: RouteSummary; query: string; clock?: TaipeiClock; timing?: SearchRouteTiming; fastest?: boolean }) {
  const query = item.matches?.query ?? requestedQuery;
  const stops = item.matches?.stops ?? [];
  const count = item.matches?.count ?? 0;
  const start = timing && timing.nextIndex > 0 ? timing.nextIndex : 0;
  const shown = stops.slice(start, start + SEARCH_STOP_PREVIEW_LIMIT);
  const hidden = count - shown.length;
  const nextTime = timing && timing.nextIndex >= 0 ? stops[timing.nextIndex]?.scheduledTime ?? null : null;
  return <>
    <span className="route-card-top">
      <strong>{item.routeName}{item.tripLabel ? `・${item.tripLabel}` : ""}</strong>
      {statusPill(timing, nextTime, fastest)}
      <i>›</i>
    </span>
    {item.matches?.broadened && <span className="route-meta">查無符合地址的站點，已擴大搜尋「{query}」；請在地圖確認停靠位置。</span>}
    {shown.length > 0 ? <ul className="nearby-stops matched-stops" aria-label={`「${query}」的站點`}>
      {shown.map((stop) => {
        const status = clock ? classifyStopTime(stop, clock) : null;
        return <li key={stop.stopId} className={status ? `status-${status}` : undefined} data-stop-id={stop.stopId} title={`在地圖查看 ${stop.name}`}>
          <span className="nearby-stop-name"><Highlight text={stop.name} query={query} /></span>
          <time>{stopTime(stop)}</time>
          {status && status !== "upcoming" && status !== "unknown" && <small className="stop-status">{stopStatusLabel(status)}</small>}
        </li>;
      })}
      {hidden > 0 && <li className="nearby-more">「{query}」上另有 {hidden} 站</li>}
    </ul> : <span className="route-meta matched-name">路線名稱符合「{query}」・{item.startStopName ?? "起點未提供"} → {item.endStopName ?? "終點未提供"}</span>}
    <span className="route-card-bottom">
      <span className="route-meta">全線 {item.firstArrivalTime ?? "--:--"}—{item.lastArrivalTime ?? "--:--"}</span>
      <span className="route-count">共 {item.stopCount} 站</span>
    </span>
  </>;
}
