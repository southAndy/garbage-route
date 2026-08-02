import type { GarbageRoute, GarbageStop, RouteCoordinateWarning } from "./types";

export function suspiciousStopIds(route: GarbageRoute | null) {
  return new Set(route?.coordinateWarnings?.flatMap((warning) => warning.affectedStopIds) ?? []);
}

export function warningForStop(route: GarbageRoute | null, stop: GarbageStop | null) {
  if (!stop) return null;
  return route?.coordinateWarnings?.find((warning) => warning.affectedStopIds.includes(stop.id)) ?? null;
}

function breaksSegment(warnings: RouteCoordinateWarning[], fromId: string, toId: string) {
  return warnings.some((warning) => {
    if (warning.type === "isolated_stop") {
      return warning.affectedStopIds.includes(fromId) || warning.affectedStopIds.includes(toId);
    }
    return warning.affectedStopIds.includes(fromId) && warning.affectedStopIds.includes(toId);
  });
}

function isLocated(stop: GarbageStop) {
  return stop.coordinateStatus === "valid" && stop.longitude !== null && stop.latitude !== null;
}

export function createDisplayGeometries(route: GarbageRoute | null) {
  const empty = { normal: null, suspicious: null };
  if (!route) return empty;
  const warnings = route.coordinateWarnings ?? [];
  const normalLines: number[][][] = [];
  const suspiciousLines: number[][][] = [];

  for (let index = 1; index < route.stops.length; index += 1) {
    const previous = route.stops[index - 1];
    const stop = route.stops[index];
    if (!isLocated(previous) || !isLocated(stop)) continue;
    const segment = [
      [previous.longitude!, previous.latitude!],
      [stop.longitude!, stop.latitude!],
    ];
    if (breaksSegment(warnings, previous.id, stop.id)) suspiciousLines.push(segment);
    else normalLines.push(segment);
  }

  const geometry = (lines: number[][][]): GeoJSON.MultiLineString | null => (
    lines.length ? { type: "MultiLineString", coordinates: lines } : null
  );
  return { normal: geometry(normalLines), suspicious: geometry(suspiciousLines) };
}
