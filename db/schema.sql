CREATE TABLE data_sources (
  id text PRIMARY KEY,
  city_code varchar(3) NOT NULL UNIQUE CHECK (city_code IN ('TPE', 'NTP')),
  name text NOT NULL,
  source_url text NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz,
  checksum text,
  status text NOT NULL DEFAULT 'stale' CHECK (status IN ('fresh', 'stale', 'syncing'))
);

CREATE TABLE garbage_routes (
  id text PRIMARY KEY,
  city_code varchar(3) NOT NULL CHECK (city_code IN ('TPE', 'NTP')),
  district text NOT NULL,
  district_slug text NOT NULL,
  source_route_id text,
  route_name text NOT NULL,
  trip_label text,
  team_name text,
  vehicle_code text,
  license_plate text,
  first_arrival_time time,
  last_arrival_time time,
  stop_count integer NOT NULL,
  geometry jsonb,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL
);

CREATE TABLE garbage_stops (
  id text PRIMARY KEY,
  route_id text NOT NULL REFERENCES garbage_routes(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  name text NOT NULL,
  address text,
  village text,
  longitude double precision,
  latitude double precision,
  arrival_time time,
  departure_time time,
  service_day_offset smallint NOT NULL DEFAULT 0,
  memo text,
  schedule jsonb,
  coordinate_status text NOT NULL CHECK (coordinate_status IN ('valid', 'missing', 'invalid')),
  UNIQUE (route_id, sequence)
);

CREATE TABLE sync_runs (
  id bigserial PRIMARY KEY,
  source_id text NOT NULL REFERENCES data_sources(id),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'failed', 'rejected')),
  http_status integer,
  raw_row_count integer,
  written_row_count integer,
  route_count integer,
  invalid_coordinate_count integer,
  skipped_row_count integer,
  checksum text,
  error_message text
);

CREATE INDEX idx_routes_city_district ON garbage_routes (city_code, district);
CREATE INDEX idx_routes_name ON garbage_routes (route_name);
CREATE INDEX idx_stops_route_sequence ON garbage_stops (route_id, sequence);
CREATE INDEX idx_sync_runs_source_started ON sync_runs (source_id, started_at DESC);
