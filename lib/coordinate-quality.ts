import type { CityCode, GarbageRoute, GarbageStop } from "./types";

const ISOLATED_STOP_MIN_LEG_KM = 3;
const ISOLATED_STOP_MAX_BYPASS_KM = 3;
const ISOLATED_STOP_MIN_DETOUR_RATIO = 4;
const LONG_SEGMENT_MIN_KM = 10;

export interface CoordinateSnapshot {
  id: string;
  sequence: number;
  name: string;
  address: string | null;
  longitude: number;
  latitude: number;
}

interface FindingBase {
  id: string;
  severity: "high";
  cityCode: CityCode;
  district: string;
  routeId: string;
  routeName: string;
  tripLabel: string | null;
  message: string;
}

export interface IsolatedStopFinding extends FindingBase {
  type: "isolated_stop";
  stop: CoordinateSnapshot;
  previousStop: CoordinateSnapshot;
  nextStop: CoordinateSnapshot;
  metrics: {
    previousDistanceKm: number;
    nextDistanceKm: number;
    bypassDistanceKm: number;
    detourRatio: number;
  };
}

export interface LongSegmentFinding extends FindingBase {
  type: "long_segment";
  fromStop: CoordinateSnapshot;
  toStop: CoordinateSnapshot;
  metrics: { distanceKm: number };
}

export type SuspiciousCoordinateFinding = IsolatedStopFinding | LongSegmentFinding;

export interface SuspiciousCoordinateReport {
  schemaVersion: 1;
  generatedAt: string;
  rules: {
    isolatedStopMinLegKm: number;
    isolatedStopMaxBypassKm: number;
    isolatedStopMinDetourRatio: number;
    longSegmentMinKm: number;
  };
  summary: {
    routesScanned: number;
    stopsScanned: number;
    findings: number;
    isolatedStops: number;
    longSegments: number;
  };
  findings: SuspiciousCoordinateFinding[];
}

function distanceKm(a: GarbageStop, b: GarbageStop) {
  const earthRadiusKm = 6371;
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude! - a.latitude!) * radians;
  const longitudeDelta = (b.longitude! - a.longitude!) * radians;
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(a.latitude! * radians) * Math.cos(b.latitude! * radians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(value));
}

const round = (value: number) => Math.round(value * 1000) / 1000;

function isLocated(stop: GarbageStop) {
  return stop.coordinateStatus === "valid" && stop.longitude !== null && stop.latitude !== null;
}

function snapshot(stop: GarbageStop): CoordinateSnapshot {
  return {
    id: stop.id,
    sequence: stop.sequence,
    name: stop.name,
    address: stop.address,
    longitude: stop.longitude!,
    latitude: stop.latitude!,
  };
}

function baseFinding(route: GarbageRoute) {
  return {
    severity: "high" as const,
    cityCode: route.cityCode,
    district: route.district,
    routeId: route.id,
    routeName: route.routeName,
    tripLabel: route.tripLabel,
  };
}

export function findSuspiciousCoordinates(routes: GarbageRoute[]) {
  const findings: SuspiciousCoordinateFinding[] = [];

  for (const route of routes) {
    const isolatedStopIds = new Set<string>();

    for (let index = 1; index < route.stops.length - 1; index += 1) {
      const previous = route.stops[index - 1];
      const stop = route.stops[index];
      const next = route.stops[index + 1];
      if (![previous, stop, next].every(isLocated)) continue;

      const previousDistance = distanceKm(previous, stop);
      const nextDistance = distanceKm(stop, next);
      const bypassDistance = distanceKm(previous, next);
      const detourRatio = (previousDistance + nextDistance) / Math.max(bypassDistance, 0.05);
      if (
        previousDistance < ISOLATED_STOP_MIN_LEG_KM
        || nextDistance < ISOLATED_STOP_MIN_LEG_KM
        || bypassDistance > ISOLATED_STOP_MAX_BYPASS_KM
        || detourRatio < ISOLATED_STOP_MIN_DETOUR_RATIO
      ) continue;

      isolatedStopIds.add(stop.id);
      findings.push({
        ...baseFinding(route),
        id: `${route.id}:isolated:${stop.id}`,
        type: "isolated_stop",
        message: `第 ${stop.sequence} 站同時遠離前後站，但前後站彼此接近，疑似單點座標錯誤。`,
        stop: snapshot(stop),
        previousStop: snapshot(previous),
        nextStop: snapshot(next),
        metrics: {
          previousDistanceKm: round(previousDistance),
          nextDistanceKm: round(nextDistance),
          bypassDistanceKm: round(bypassDistance),
          detourRatio: round(detourRatio),
        },
      });
    }

    for (let index = 1; index < route.stops.length; index += 1) {
      const from = route.stops[index - 1];
      const to = route.stops[index];
      if (!isLocated(from) || !isLocated(to) || isolatedStopIds.has(from.id) || isolatedStopIds.has(to.id)) continue;
      const distance = distanceKm(from, to);
      if (distance < LONG_SEGMENT_MIN_KM) continue;
      findings.push({
        ...baseFinding(route),
        id: `${route.id}:segment:${from.id}:${to.id}`,
        type: "long_segment",
        message: `第 ${from.sequence}–${to.sequence} 站直線距離異常，需人工確認兩端座標。`,
        fromStop: snapshot(from),
        toStop: snapshot(to),
        metrics: { distanceKm: round(distance) },
      });
    }
  }

  return findings.sort((a, b) => {
    const aDistance = a.type === "long_segment"
      ? a.metrics.distanceKm
      : Math.min(a.metrics.previousDistanceKm, a.metrics.nextDistanceKm);
    const bDistance = b.type === "long_segment"
      ? b.metrics.distanceKm
      : Math.min(b.metrics.previousDistanceKm, b.metrics.nextDistanceKm);
    return bDistance - aDistance;
  });
}

export function createSuspiciousCoordinateReport(
  routes: GarbageRoute[],
  generatedAt = new Date().toISOString(),
): SuspiciousCoordinateReport {
  const findings = findSuspiciousCoordinates(routes);
  return {
    schemaVersion: 1,
    generatedAt,
    rules: {
      isolatedStopMinLegKm: ISOLATED_STOP_MIN_LEG_KM,
      isolatedStopMaxBypassKm: ISOLATED_STOP_MAX_BYPASS_KM,
      isolatedStopMinDetourRatio: ISOLATED_STOP_MIN_DETOUR_RATIO,
      longSegmentMinKm: LONG_SEGMENT_MIN_KM,
    },
    summary: {
      routesScanned: routes.length,
      stopsScanned: routes.reduce((sum, route) => sum + route.stops.length, 0),
      findings: findings.length,
      isolatedStops: findings.filter((finding) => finding.type === "isolated_stop").length,
      longSegments: findings.filter((finding) => finding.type === "long_segment").length,
    },
    findings,
  };
}
