import { describe, expect, it } from "vitest";

import { labels } from "../src/i18n";
import { overlayHtml } from "../src/landing";

const t = labels("en");

describe("settings overlay language choice", () => {
  const html = (showLanguage?: boolean): string =>
    overlayHtml([], "", "en", [], null, "", t, showLanguage);

  it("offers the language chips by default", () => {
    expect(html().match(/data-lang="/g)).toHaveLength(6);
    expect(html()).toContain(t.language);
  });

  it("leaves them out for a host that owns the language", () => {
    expect(html(false)).not.toContain("data-lang=");
    expect(html(false)).not.toContain("chips-langs");
  });
});
