import { describe, expect, it } from "vitest";

import { labels } from "../src/i18n";
import { stationPlaceNoteHtml } from "../src/landing";

describe("stationPlaceNoteHtml", () => {
  const t = labels("en");

  it("says how far the forecast station is from the place's centre", () => {
    const html = stationPlaceNoteHtml("Reykjavík", 2.1234, t);
    expect(html).toBe(
      '<div class="loc-note">Forecast for the weather station 2.1 km from Reykjavík centre</div>',
    );
  });

  it("is written in the widget's language", () => {
    expect(stationPlaceNoteHtml("Borgarnes", 0.5, labels("is"))).toContain(
      "Borgarnes: spá fyrir veðurstöð 0,5 km",
    );
  });

  it("escapes the host's place name", () => {
    const html = stationPlaceNoteHtml("<b>Vík</b>", 1, t);
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b>Vík&lt;/b>");
  });

  it("is empty without a place or a usable distance", () => {
    expect(stationPlaceNoteHtml(null, 2, t)).toBe("");
    expect(stationPlaceNoteHtml("  ", 2, t)).toBe("");
    expect(stationPlaceNoteHtml("Reykjavík", NaN, t)).toBe("");
    expect(stationPlaceNoteHtml("Reykjavík", -1, t)).toBe("");
  });

  it("has the line in every language, with that language's decimal separator", () => {
    const km = { is: "2,1 km", en: "2.1 km", es: "2,1 km", pt: "2,1 km", pl: "2,1 km", fo: "2,1 km" };
    for (const lang of ["is", "en", "es", "pt", "pl", "fo"] as const) {
      const html = stationPlaceNoteHtml("Höfn", 2.1, labels(lang));
      expect(html, lang).toContain("Höfn");
      expect(html, lang).toContain(km[lang]);
    }
  });
});
