import { afterEach, describe, expect, it, vi } from "vitest";

import { wireTapToScrub } from "../src/render";

/** Just enough of an element to register listeners and fire them. */
function fakeTarget() {
  const handlers = new Map<string, (e: unknown) => void>();
  return {
    addEventListener: (type: string, fn: (e: unknown) => void) =>
      handlers.set(type, fn),
    fire: (type: string, e: unknown = {}) => handlers.get(type)?.(e),
  };
}

const touch = (x: number, y: number) =>
  ({ pointerType: "touch", clientX: x, clientY: y }) as PointerEvent;

describe("wireTapToScrub", () => {
  afterEach(() => vi.useRealTimers());

  it("scrubs on a tap", () => {
    const el = fakeTarget();
    const scrub = vi.fn();
    wireTapToScrub(el as unknown as Element, scrub);
    el.fire("pointerdown", touch(100, 50));
    el.fire("pointerup", touch(104, 52));
    expect(scrub).toHaveBeenCalledTimes(1);
  });

  it("leaves a drag to pan the chart", () => {
    const el = fakeTarget();
    const scrub = vi.fn();
    wireTapToScrub(el as unknown as Element, scrub);
    el.fire("pointerdown", touch(100, 50));
    el.fire("pointerup", touch(160, 50));
    expect(scrub).not.toHaveBeenCalled();
  });

  it("ignores a long press", () => {
    vi.useFakeTimers();
    const el = fakeTarget();
    const scrub = vi.fn();
    wireTapToScrub(el as unknown as Element, scrub);
    el.fire("pointerdown", touch(100, 50));
    vi.advanceTimersByTime(800);
    el.fire("pointerup", touch(100, 50));
    expect(scrub).not.toHaveBeenCalled();
  });

  it("does nothing once the browser has taken the gesture over", () => {
    const el = fakeTarget();
    const scrub = vi.fn();
    wireTapToScrub(el as unknown as Element, scrub);
    el.fire("pointerdown", touch(100, 50));
    el.fire("pointercancel");
    el.fire("pointerup", touch(100, 50));
    expect(scrub).not.toHaveBeenCalled();
  });

  it("leaves mouse pointers to the hover scrub", () => {
    const el = fakeTarget();
    const scrub = vi.fn();
    wireTapToScrub(el as unknown as Element, scrub);
    const mouse = { pointerType: "mouse", clientX: 100, clientY: 50 };
    el.fire("pointerdown", mouse);
    el.fire("pointerup", mouse);
    expect(scrub).not.toHaveBeenCalled();
  });
});
