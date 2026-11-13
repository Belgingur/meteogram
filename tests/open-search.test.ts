import { describe, expect, it } from "vitest";

import { searchFocusSelector } from "../src/landing";

describe("openSearch()'s focus", () => {
  it("goes to the search field with a fine pointer", () => {
    expect(searchFocusSelector(true)).toBe(".station-search");
  });

  it("goes to the dialog with a coarse pointer, so no keyboard jumps up", () => {
    expect(searchFocusSelector(false)).toBe(".overlay");
  });
});
