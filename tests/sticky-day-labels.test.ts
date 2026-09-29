import { describe, expect, it } from "vitest";

import { DAY_LABEL_PAD, wireStickyDayLabels } from "../src/render";

/** Just enough of an element to register listeners and fire them. */
function fakeTarget() {
  const handlers = new Map<string, (e: unknown) => void>();
  return {
    addEventListener: (type: string, fn: (e: unknown) => void) =>
      handlers.set(type, fn),
    fire: (type: string, e: unknown = {}) => handlers.get(type)?.(e),
  };
}

describe("wireStickyDayLabels", () => {
  function fakeLabel(x0: number, x1: number) {
    const attrs: Record<string, string> = {};
    return {
      dataset: { x0: String(x0), x1: String(x1) },
      setAttribute: (k: string, v: string) => (attrs[k] = v),
      get x() {
        return Number(attrs.x);
      },
    };
  }

  function fakeScroller(labels: ReturnType<typeof fakeLabel>[]) {
    return {
      ...fakeTarget(),
      scrollLeft: 0,
      querySelectorAll: () => labels,
    };
  }

  it("rests each label at its day's left edge before scrolling", () => {
    const label = fakeLabel(8, 500);
    wireStickyDayLabels(fakeScroller([label]) as unknown as HTMLElement);
    expect(label.x).toBe(8);
  });

  it("follows the viewport through its own day", () => {
    const label = fakeLabel(8, 500);
    const scroller = fakeScroller([label]);
    wireStickyDayLabels(scroller as unknown as HTMLElement);
    scroller.scrollLeft = 200;
    scroller.fire("scroll");
    expect(label.x).toBe(200 + DAY_LABEL_PAD);
  });

  it("stops short of the next day instead of running into it", () => {
    const label = fakeLabel(8, 500);
    const scroller = fakeScroller([label]);
    wireStickyDayLabels(scroller as unknown as HTMLElement);
    scroller.scrollLeft = 900;
    scroller.fire("scroll");
    expect(label.x).toBe(500);
  });

  it("maps scroll offset through the display scale", () => {
    const label = fakeLabel(8, 500);
    const scroller = fakeScroller([label]);
    wireStickyDayLabels(scroller as unknown as HTMLElement, () => 2);
    scroller.scrollLeft = 200;
    scroller.fire("scroll");
    expect(label.x).toBe(100 + DAY_LABEL_PAD);
  });

  it("pins a day too narrow to travel to its own edge", () => {
    const label = fakeLabel(300, 280);
    const scroller = fakeScroller([label]);
    wireStickyDayLabels(scroller as unknown as HTMLElement);
    scroller.scrollLeft = 400;
    scroller.fire("scroll");
    expect(label.x).toBe(300);
  });
});
