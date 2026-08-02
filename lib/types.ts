export type CityCode = "TPE" | "NTP";
export type CoordinateStatus = "valid" | "missing" | "invalid";

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
  source: {
    name: string;
    url: string;
    sourceUpdatedAt: string | null;
    syncedAt: string;
    stale?: boolean;
  };
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
}
