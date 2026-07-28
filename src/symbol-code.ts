/**
 * Map weather variables to a yr.no-convention symbol code ("01d" … "50").
 * Ported from WOD widgets-2 chart/weather-symbol.ts (itself adapted from
 * troupe/src/api_v2/data/point/meteogram.py) so the same production symbol
 * set renders identically.
 */

const descriptionToSymbol: Record<string, string> = {
  clear_no_rain: "01",
  fair_no_rain: "02",
  scattered_no_rain: "03",

  scattered_little_rain: "40",
  scattered_some_rain: "05",
  scattered_much_rain: "41",
  scattered_little_sleet: "42",
  scattered_some_sleet: "07",
  scattered_much_sleet: "43",
  scattered_little_snow: "44",
  scattered_some_snow: "08",
  scattered_much_snow: "45",

  overcast_no_rain: "04",

  overcast_little_rain: "46",
  overcast_some_rain: "09",
  overcast_much_rain: "10",
  overcast_little_sleet: "47",
  overcast_some_sleet: "12",
  overcast_much_sleet: "48",
  overcast_little_snow: "49",
  overcast_some_snow: "13",
  overcast_much_snow: "50",
};

export function weatherSymbolCode(
  lwe_precipitation_rate: number | null,
  cloud_area_fraction: number | null,
  snow_fraction: number | null,
  daylight_fraction: number | null,
  timestep_h = 1,
): string {
  if (
    cloud_area_fraction === null ||
    daylight_fraction === null ||
    (!lwe_precipitation_rate && lwe_precipitation_rate !== 0)
  ) {
    return "";
  }

  let precipitation: string;
  if (lwe_precipitation_rate < 0.1 * timestep_h) {
    precipitation = "no";
  } else if (lwe_precipitation_rate < 0.3 * timestep_h) {
    precipitation = "little";
  } else if (lwe_precipitation_rate < 3 * timestep_h) {
    precipitation = "some";
  } else {
    precipitation = "much";
  }

  let clouds: string;
  if (cloud_area_fraction < 0.25) {
    clouds = precipitation === "no" ? "clear" : "scattered";
  } else if (cloud_area_fraction < 0.5) {
    clouds = precipitation === "no" ? "fair" : "scattered";
  } else if (cloud_area_fraction < 0.75) {
    clouds = "scattered";
  } else {
    clouds = "overcast";
  }

  let kind: string;
  if (
    (!snow_fraction && snow_fraction !== 0) ||
    snow_fraction < 0.33 ||
    precipitation === "no"
  ) {
    kind = "rain";
  } else if (snow_fraction < 0.66) {
    kind = "sleet";
  } else {
    kind = "snow";
  }

  const code = descriptionToSymbol[`${clouds}_${precipitation}_${kind}`];
  if (!code) return "";

  let dayOrNight = "";
  if (clouds !== "overcast") {
    dayOrNight = daylight_fraction < 0.75 ? "n" : "d";
  }
  return `${code}${dayOrNight}`;
}
