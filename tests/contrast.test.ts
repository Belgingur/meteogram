import { describe, expect, it } from "vitest";

import { DATA_COLORS } from "../src/colors";
import { componentStyles } from "../src/styles";

/**
 * WCAG 2.1 contrast floors for a public widget: 4.5:1 for text (the labels here
 * are 10–14 px, never "large"), 3:1 for graphics a reader has to see (the now
 * line, the gust line). The greys used to sit at 2.6:1 (tick labels, hints) and
 * 3.8:1 (muted labels on the frost page), the now line at 2.1:1.
 */

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

function token(name: string): string {
  const m = componentStyles.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`no --${name} token`);
  return m[1];
}

const PAPER = token("paper");
const FROST = token("frost");

describe("text contrast", () => {
  const text: Record<string, string> = {
    "DATA_COLORS.none (ticks, missing readings)": DATA_COLORS.none,
    "DATA_COLORS.neutral (hour/day labels)": DATA_COLORS.neutral,
    "DATA_COLORS.precipText": DATA_COLORS.precipText,
    "DATA_COLORS.windText": DATA_COLORS.windText,
    "DATA_COLORS.temp": DATA_COLORS.temp,
    "DATA_COLORS.tempCold": DATA_COLORS.tempCold,
    "--haze": token("haze"),
    "--haze-2": token("haze-2"),
    "--aurora-ink": token("aurora-ink"),
  };

  for (const [name, fg] of Object.entries(text)) {
    it(`${name} reads at 4.5:1 on the card`, () => {
      expect(contrast(fg, PAPER)).toBeGreaterThanOrEqual(4.5);
    });
  }

  // The mobile page background carries the muted labels (eyebrows, stat labels).
  for (const name of ["haze", "haze-2"]) {
    it(`--${name} reads at 4.5:1 on the frost page`, () => {
      expect(contrast(token(name), FROST)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("graphics contrast", () => {
  it("the now line and the gust line reach 3:1 on the chart", () => {
    expect(contrast(DATA_COLORS.now, PAPER)).toBeGreaterThanOrEqual(3);
    expect(contrast(DATA_COLORS.gust, PAPER)).toBeGreaterThanOrEqual(3);
  });

  it("gusts stay lighter than the wind line they shadow", () => {
    expect(luminance(DATA_COLORS.gust)).toBeGreaterThan(luminance(DATA_COLORS.wind));
  });
});
