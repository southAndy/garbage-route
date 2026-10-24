import type { NearbyRoute } from "../lib/nearby-search";
import { formatDistance } from "../lib/geolocation";
import { classifyStopTime, stopStatusLabel, type NearbyRouteTiming, type TaipeiClock } from "../lib/stop-timing";

function stopTime(stop: NearbyRoute["nearby"]["stops"][number]) {
  if (!stop.scheduledTime) return "時間未提供";
  return `${stop.scheduledTime}${stop.serviceDayOffset ? "（次日）" : ""}`;
}

/**
 * Body of a search-result card in nearby mode. Leads with the closest stops
 * and their scheduled times; the whole-route span is demoted to the footer
 * so it is not mistaken for when the truck reaches the user.
 *
 * Each stop row carries `data-stop-id`; the enclosing card link reads it on
 * click so tapping a row opens the route focused on that stop.
 */
export default function NearbyRouteCard({ item, clock, timing }: { item: NearbyRoute; clock?: TaipeiClock; timing?: NearbyRouteTiming }) {
  const { nearby } = item;
  const hidden = nearby.count - nearby.stops.length;
  const singleTime = nearby.count === 1 || nearby.firstTime === nearby.lastTime;
  const routeLabel = timing ? stopStatusLabel(timing.status) : null;
  return <>
    <span className="route-card-top">
      <strong>{item.routeName}{item.tripLabel ? `・${item.tripLabel}` : ""}</strong>
      <span className="nearby-badge">最近 {formatDistance(nearby.nearestDistanceMeters)}</span>
      <i>›</i>
    </span>
    <span className="route-time nearby-time">
      <small>附近站點表定時間{routeLabel && <b className={`stop-status status-${timing?.status}`}>{routeLabel}</b>}</small>
      {singleTime ? (nearby.firstTime ?? "--:--") : <>{nearby.firstTime ?? "--:--"}<em>—</em>{nearby.lastTime ?? "--:--"}</>}
    </span>
    <ul className="nearby-stops" aria-label="附近的站點">
      {nearby.stops.map((stop) => {
        const status = clock ? classifyStopTime(stop, clock) : null;
        return <li key={stop.stopId} className={status ? `status-${status}` : undefined} data-stop-id={stop.stopId} title={`在地圖查看 ${stop.name}`}>
          <span className="nearby-stop-name">{stop.name}</span>
          <span className="nearby-stop-distance">{formatDistance(stop.distanceMeters)}</span>
          <time>{stopTime(stop)}</time>
          {status && status !== "upcoming" && status !== "unknown" && <small className="stop-status">{stopStatusLabel(status)}</small>}
        </li>;
      })}
      {hidden > 0 && <li className="nearby-more">範圍內另有 {hidden} 站，請查看完整路線</li>}
    </ul>
    <span className="route-card-bottom">
      <span className="route-meta">{item.district}・全線 {item.firstArrivalTime ?? "--:--"}—{item.lastArrivalTime ?? "--:--"}</span>
      <span className="route-count">共 {item.stopCount} 站</span>
    </span>
  </>;
}
