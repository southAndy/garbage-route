export type CityCode = "TPE" | "NTP";
export type CoordinateStatus = "valid" | "missing" | "invalid";

export interface RouteCoordinateWarning {
  id: string;
  type: "isolated_stop" | "long_segment";
  severity: "high";
  message: string;
  affectedStopIds: string[];
}

export interface CollectionSchedule {
  garbage: boolean[];
  recycling: boolean[];
  foodScraps: boolean[];
}

export interface GarbageStop {
  id: string;
  routeId: string;
  sequence: number;
  name: string;
  address: string | null;
  village: string | null;
  longitude: number | null;
  latitude: number | null;
  arrivalTime: string | null;
  departureTime: string | null;
  serviceDayOffset: number;
  memo: string | null;
  schedule: CollectionSchedule | null;
  coordinateStatus: CoordinateStatus;
}

export interface GarbageRoute {
  id: string;
  cityCode: CityCode;
  district: string;
  districtSlug: string;
  sourceRouteId: string | null;
  routeName: string;
  tripLabel: string | null;
  teamName: string | null;
  vehicleCode: string | null;
  licensePlate: string | null;
  firstArrivalTime: string | null;
  lastArrivalTime: string | null;
  stopCount: number;
  geometry: GeoJSON.LineString | null;
  stops: GarbageStop[];
  coordinateWarnings?: RouteCoordinateWarning[];
  source: {
    name: string;
    url: string;
    sourceUpdatedAt: string | null;
    syncedAt: string;
    lastCheckedAt?: string;
    stale?: boolean;
  };
}

/** A stop that matched a text search, with what stop-timing needs to say whether it is still coming. */
export interface MatchedStop {
  stopId: string;
  sequence: number;
  name: string;
  scheduledTime: string | null;
  serviceDayOffset: number;
  /** Garbage-collection weekdays (index 0 = Sunday); null when the source has none. */
  serviceDays: boolean[] | null;
}

export interface RouteSummary {
  id: string;
  cityCode: CityCode;
  district: string;
  districtSlug: string;
  routeName: string;
  tripLabel: string | null;
  firstArrivalTime: string | null;
  lastArrivalTime: string | null;
  startStopName: string | null;
  endStopName: string | null;
  stopCount: number;
  /** Only on text-search results: the stops whose name, address or village matched, in route order. */
  matches?: { count: number; stops: MatchedStop[]; query?: string; broadened?: boolean };
}
