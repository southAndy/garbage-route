import type { NearbyRoute } from "../lib/nearby-search";
import { formatDistance } from "../lib/geolocation";

function stopTime(stop: NearbyRoute["nearby"]["stops"][number]) {
  if (!stop.scheduledTime) return "時間未提供";
  return `${stop.scheduledTime}${stop.serviceDayOffset ? "（次日）" : ""}`;
}

/**
 * Body of a search-result card in nearby mode. Leads with the closest stops
 * and their scheduled times; the whole-route span is demoted to the footer
 * so it is not mistaken for when the truck reaches the user.
 */
export default function NearbyRouteCard({ item }: { item: NearbyRoute }) {
  const { nearby } = item;
  const hidden = nearby.count - nearby.stops.length;
  const singleTime = nearby.count === 1 || nearby.firstTime === nearby.lastTime;
  return <>
    <span className="route-card-top">
      <strong>{item.routeName}{item.tripLabel ? `・${item.tripLabel}` : ""}</strong>
      <span className="nearby-badge">最近 {formatDistance(nearby.nearestDistanceMeters)}</span>
      <i>›</i>
    </span>
    <span className="route-time nearby-time">
      <small>附近站點表定時間</small>
      {singleTime ? (nearby.firstTime ?? "--:--") : <>{nearby.firstTime ?? "--:--"}<em>—</em>{nearby.lastTime ?? "--:--"}</>}
    </span>
    <ul className="nearby-stops" aria-label="附近的站點">
      {nearby.stops.map((stop) => <li key={stop.stopId}>
        <span className="nearby-stop-name">{stop.name}</span>
        <span className="nearby-stop-distance">{formatDistance(stop.distanceMeters)}</span>
        <time>{stopTime(stop)}</time>
      </li>)}
      {hidden > 0 && <li className="nearby-more">範圍內另有 {hidden} 站，請查看完整路線</li>}
    </ul>
    <span className="route-card-bottom">
      <span className="route-meta">{item.district}・全線 {item.firstArrivalTime ?? "--:--"}—{item.lastArrivalTime ?? "--:--"}</span>
      <span className="route-count">共 {item.stopCount} 站</span>
    </span>
  </>;
}
