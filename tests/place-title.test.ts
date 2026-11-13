import { describe, expect, it } from "vitest";

import { labels } from "../src/i18n";
import { chipPlace, locationSubHtml, panelSummary, placeTitle, type Place } from "../src/landing";

const t = labels("en");
const places: Place[] = [
  { name: "Reykjavík", lat: 64.127, lon: -21.902 },
  { name: "Keflavíkurflugvöllur", lat: 63.985, lon: -22.605 },
];
const point = { lat: 64.18, lon: -21.85 };
const base = {
  locationName: null,
  pickedName: "",
  preferCoordinates: false,
  places,
  ...point,
  t,
};

describe("placeTitle", () => {
  it("takes the host's location-name first", () => {
    expect(
      placeTitle({ ...base, locationName: "Seltjarnarnes", pickedName: "Reykjavík", preferCoordinates: true }),
    ).toEqual({ name: "Seltjarnarnes", source: "attribute" });
  });

  it("takes a station picked in the list next", () => {
    expect(placeTitle({ ...base, pickedName: "Keflavíkurflugvöllur", preferCoordinates: true })).toEqual({
      name: "Keflavíkurflugvöllur",
      source: "picked",
    });
  });

  it("names the point by its coordinates with prefer-coordinates", () => {
    expect(placeTitle({ ...base, preferCoordinates: true })).toEqual({
      name: "64.18°N 21.85°W",
      source: "coordinates",
    });
  });

  it("names the nearest station otherwise", () => {
    expect(placeTitle(base)).toEqual({ name: "Reykjavík", source: "station" });
  });

  it("falls back to the coordinates when there is no station", () => {
    expect(placeTitle({ ...base, places: [] })).toEqual({
      name: "64.18°N 21.85°W",
      source: "coordinates",
    });
  });

  it("names the first station when there is no point to measure from", () => {
    expect(placeTitle({ ...base, lat: NaN, preferCoordinates: true })).toEqual({
      name: "Reykjavík",
      source: "station",
    });
  });

  it("writes the coordinates with the language's compass letter and decimal separator", () => {
    expect(placeTitle({ ...base, preferCoordinates: true, t: labels("is") }).name).toBe(
      "64,18°N 21,85°V",
    );
  });
});

describe("locationSubHtml", () => {
  const badge = '<span class="corrected"></span>';

  it("shows the coordinates under a place's name, then the badge", () => {
    for (const source of ["attribute", "picked", "station"] as const) {
      expect(locationSubHtml(point.lat, point.lon, source, "", t), source).toBe("64.18°N 21.85°W");
      expect(locationSubHtml(point.lat, point.lon, source, badge, t), source).toBe(
        `64.18°N 21.85°W${badge}`,
      );
    }
  });

  it("leaves the coordinates out under a title that is the coordinates, but keeps the badge", () => {
    expect(locationSubHtml(point.lat, point.lon, "coordinates", "", t)).toBe("");
    expect(locationSubHtml(point.lat, point.lon, "coordinates", badge, t)).toBe(badge);
  });

  it("goes by where the title came from, not by its text", () => {
    // A host may pass the coordinate text as the name: it is still its name.
    const title = placeTitle({ ...base, locationName: "64.18°N 21.85°W" });
    expect(title.source).toBe("attribute");
    expect(locationSubHtml(point.lat, point.lon, title.source, "", t)).toBe("64.18°N 21.85°W");
  });

  it("shows no coordinates without a point", () => {
    expect(locationSubHtml(NaN, point.lon, "station", badge, t)).toBe(badge);
  });
});

describe("the header chip's place", () => {
  const chip = (place: string) =>
    panelSummary({ modelName: "BEL-IS_EC", place, lang: "EN", tzOffsetMin: 0 });

  it("leaves the place out when the title is the point's coordinates", () => {
    const title = placeTitle({ ...base, preferCoordinates: true });
    expect(title.source).toBe("coordinates");
    expect(chip(chipPlace(title, true))).toBe("BEL-IS_EC · EN · UTC");
  });

  it("keeps a place's name, from every source of one", () => {
    for (const opts of [
      { locationName: "Reykjavík" },
      { pickedName: "Keflavíkurflugvöllur" },
      { preferCoordinates: false },
    ]) {
      const title = placeTitle({ ...base, ...opts });
      expect(title.source).not.toBe("coordinates");
      expect(chip(chipPlace(title, true))).toBe(`BEL-IS_EC · ${title.name} · EN · UTC`);
    }
  });

  it("keeps the coordinates where the title isn't shown (the landscape sheet)", () => {
    const title = placeTitle({ ...base, preferCoordinates: true });
    expect(chip(chipPlace(title, false))).toBe("BEL-IS_EC · 64.18°N 21.85°W · EN · UTC");
  });
});
