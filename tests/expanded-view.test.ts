import { describe, expect, it } from "vitest";

import { labels, LANGS } from "../src/i18n";
import { expandedBodyHtml, expandedView, type ExpandedView } from "../src/landing";

const t = labels("en");
const LEFT = '<div class="LEFT"></div>';
const RIGHT = '<div class="RIGHT"></div>';
const COLLAPSE = '<button class="COLLAPSE"></button>';
const body = (v: ExpandedView) => expandedBodyHtml(v, LEFT, RIGHT, COLLAPSE, t);

describe("the expanded panel's Table / Graph / Both", () => {
  it("defaults to Both, and reads anything else as Both", () => {
    for (const stored of [undefined, null, "", "graphs", 3, "view"]) {
      expect(expandedView(stored)).toBe("both");
    }
  });

  it("reads a stored choice back", () => {
    for (const v of ["table", "graph", "both"] as const) {
      const state = JSON.parse(JSON.stringify({ expandedView: v })) as { expandedView: unknown };
      expect(expandedView(state.expandedView)).toBe(v);
    }
  });

  it("Both shows the table column and the graph column", () => {
    const html = body("both");
    expect(html).toContain("exp-left");
    expect(html).toContain("exp-right");
    expect(html).toContain(LEFT);
    expect(html).toContain(RIGHT);
    expect(html).not.toContain(COLLAPSE);
  });

  it("Table shows only the table column, with the collapse button in the bar", () => {
    const html = body("table");
    expect(html).toContain(LEFT);
    expect(html).not.toContain("exp-right");
    expect(html).not.toContain(RIGHT);
    expect(html).toContain(COLLAPSE);
  });

  it("Graph shows only the graph column", () => {
    const html = body("graph");
    expect(html).toContain(RIGHT);
    expect(html).not.toContain("exp-left");
    expect(html).not.toContain(LEFT);
    expect(html).not.toContain(COLLAPSE);
  });

  it("marks the chosen button pressed, and only that one", () => {
    for (const v of ["table", "graph", "both"] as const) {
      const pressed = [...body(v).matchAll(/data-exp-view="(\w+)" aria-pressed="true"/g)].map((m) => m[1]);
      expect(pressed).toEqual([v]);
    }
  });

  it("has a label for Both in every language", () => {
    for (const { code } of LANGS) expect(labels(code).both, code).toMatch(/\S/);
  });
});
