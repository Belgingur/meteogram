export interface ForecastUrl {
  id: string;
  name: string | { [locale: string]: string };
  url: string;
}

export interface StationMetadata {
  id: string;
  lat: number;
  lon: number;
  name: string | { [locale: string]: string };
  ref?: string;
}

export interface ForecastMetadata {
  duration_h: number;
  forecast_id: string;
  station_data_url: string;
  stations: StationMetadata[];
  url: string;
}

export interface MeteoConfigResponse {
  expires: string;
  forecasts: ForecastUrl[];
}

/** Raw response of .../meteogram.json */
export interface MeteogramData {
  time: string[];
  data: { [variableName: string]: (number | null)[] };
  meta: {
    /** Minutes the location's timezone is ahead of UTC. */
    location_timezone_offset?: number;
    /** Model run / analysis time (ISO 8601). Shown as "Greiningartími".
     *  Distinct from the first forecast step in `time[0]`, which is typically
     *  the analysis time plus the lead offset. */
    analysis?: string;
    /** When the forecast data was last updated (ISO 8601). Preferred over the
     *  HTTP Last-Modified header for the "last update" line. */
    last_modified?: string;
  };
}

/** One hour of forecast, ready for rendering */
export interface HourPoint {
  /** Timestamp shifted to the location's timezone; read with getUTC* accessors */
  local: Date;
  /** True UTC timestamp in ms, for locating "now" in the series */
  utcMs: number;
  tempC: number | null;
  precipMm: number;
  /** Hámarksúrkoma — max precipitation, mm per timestep */
  precipMaxMm: number;
  windMs: number | null;
  gustMs: number | null;
  /** Meteorological direction the wind blows FROM, degrees */
  dirDeg: number | null;
  /** yr.no-style symbol code, e.g. "02d"; empty when not computable */
  symbol: string;
}
