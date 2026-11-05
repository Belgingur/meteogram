import { describe, expect, it } from "vitest";

import { labels } from "../src/i18n";
import { correctedBadgeHtml } from "../src/landing";

describe("correctedBadgeHtml", () => {
  const t = labels("en");

  it("is empty when nothing was corrected", () => {
    expect(correctedBadgeHtml([], "Akureyri", t)).toBe("");
  });

  it("names the station and the corrected readings in its label, not on screen", () => {
    const html = correctedBadgeHtml(
      ["air_temperature_at_2m_agl", "wind_speed_at_10m_agl"],
      "Akureyri",
      t,
    );
    expect(html.replace(/<[^>]*>/g, "").trim()).toBe("");
    expect(html).toContain('role="img"');
    expect(html).toContain(
      'aria-label="Corrected against observations at Akureyri: temp, wind"',
    );
  });

  it("lists a lane once however many of its variables were corrected", () => {
    const html = correctedBadgeHtml(
      ["wind_speed_at_10m_agl", "wind_from_direction_at_10m_agl"],
      "Höfn",
      t,
    );
    expect(html).toContain('title="Corrected against observations at Höfn: wind"');
  });

  it("still marks the forecast when no corrected variable has a lane", () => {
    const html = correctedBadgeHtml(["cloud_area_fraction"], "Höfn", t);
    expect(html).toContain('title="Corrected against observations at Höfn"');
  });
});
