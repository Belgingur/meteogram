import { describe, expect, it } from "vitest";

import { componentStyles } from "../src/styles";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The pointer-device block that styles the chart's scrollbar. */
const block = (() => {
  const start = componentStyles.indexOf("@media (hover: hover) and (pointer: fine) {\n  .chart-scroll");
  expect(start).toBeGreaterThan(-1);
  return componentStyles.slice(start, componentStyles.indexOf("\n}", start));
})();

const token = (name: string) =>
  componentStyles.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))![1];

describe("the chart's scrollbar on pointer devices", () => {
  it("leaves out the standard properties that would override the custom bar", () => {
    expect(block).not.toMatch(/scrollbar-width|scrollbar-color/);
  });

  it("is 12 to 14 px tall", () => {
    const h = Number(block.match(/::-webkit-scrollbar \{ height: (\d+)px; \}/)![1]);
    expect(h).toBeGreaterThanOrEqual(12);
    expect(h).toBeLessThanOrEqual(14);
  });

  it("has a thumb at 3 : 1 or more against the panel, hovered or not", () => {
    const thumbs = [...block.matchAll(/scrollbar-thumb(?::hover)? \{[^}]*background: (#[0-9A-Fa-f]{6})/g)].map(
      (m) => m[1],
    );
    expect(thumbs).toHaveLength(2);
    for (const thumb of thumbs) {
      for (const bg of ["#FFFFFF", token("paper"), token("frost")]) {
        expect(contrast(thumb, bg), `${thumb} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
