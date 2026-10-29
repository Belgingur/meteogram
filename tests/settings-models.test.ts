import { describe, expect, it } from "vitest";

import { labels } from "../src/i18n";
import { overlayHtml } from "../src/landing";

const t = labels("en");
const models = [
  { id: "upstream/a", name: "A" },
  { id: "upstream/b", name: "B" },
];

describe("settings overlay model choice", () => {
  const html = (showLanguage?: boolean, showModels?: boolean): string =>
    overlayHtml(models, "upstream/a", "en", [], null, "", t, showLanguage, showModels);

  it("offers the model chips by default", () => {
    expect(html().match(/data-model="/g)).toHaveLength(2);
    expect(html()).toContain(t.forecastModel);
  });

  it("leaves them out for a host that picks the forecast", () => {
    expect(html(true, false)).not.toContain("data-model=");
    expect(html(true, false)).not.toContain("chips-models");
    expect(html(true, false)).toContain("data-lang=");
  });

  it("leaves no empty column when both choices are hidden", () => {
    const both = html(false, false);
    expect(both).toContain("ov-cols--single");
    expect(both.match(/class="ov-col[ "]/g)).toHaveLength(1);
    expect(both).toContain("station-search");
    expect(html()).not.toContain("ov-cols--single");
  });
});
