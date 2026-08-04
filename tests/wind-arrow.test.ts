import { describe, expect, it } from "vitest";

import { arrowSvg } from "../src/graph-card";

/**
 * Wind arrows follow the meteorological convention: `dirDeg` is the direction
 * the wind comes *from*, and the arrow points to where it blows *toward*.
 * The glyph is authored tip-down, so the rotation equals the from-direction —
 * these tests pin that down, because the pre-fix code rotated by dir + 180°
 * and every arrow pointed back at the source of the wind.
 */
describe("arrowSvg", () => {
  const rotationOf = (svg: string): number => {
    const match = /rotate\(([-\d.]+)deg\)/.exec(svg);
    if (!match) throw new Error(`no rotation in ${svg}`);
    return Number(match[1]);
  };

  it("is drawn tip-down, so rotate(0) already points south", () => {
    const svg = arrowSvg(0, 20, "#000");
    // Arrowhead vertex sits below the shaft's top end (SVG y grows downward).
    expect(svg).toContain(`<line x1="10" y1="3.5" x2="10" y2="15"/>`);
    expect(svg).toContain(`M5.5 11 L10 16 L14.5 11`);
  });

  it("rotates by the from-direction, not from-direction + 180°", () => {
    // Northerly wind (from 0°) blows south: the tip-down glyph, unrotated.
    expect(rotationOf(arrowSvg(0, 20, "#000"))).toBe(0);
    // Easterly wind (from 90°) blows west: rotate the tip-down glyph 90° CW.
    expect(rotationOf(arrowSvg(90, 20, "#000"))).toBe(90);
    expect(rotationOf(arrowSvg(180, 20, "#000"))).toBe(180);
    expect(rotationOf(arrowSvg(270, 20, "#000"))).toBe(270);
  });

  it("normalises out-of-range directions", () => {
    expect(rotationOf(arrowSvg(360, 20, "#000"))).toBe(0);
    expect(rotationOf(arrowSvg(-90, 20, "#000"))).toBe(270);
  });

  it("renders nothing without a direction", () => {
    expect(arrowSvg(null, 20, "#000")).toBe("");
  });
});
