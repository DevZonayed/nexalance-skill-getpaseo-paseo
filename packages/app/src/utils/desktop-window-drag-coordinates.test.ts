import { describe, expect, it } from "vitest";

import { readFiniteScreenPoint } from "./desktop-window-drag-coordinates";

describe("readFiniteScreenPoint", () => {
  it("returns finite screen coordinates", () => {
    expect(readFiniteScreenPoint({ screenX: 1280, screenY: 720 })).toEqual({
      screenX: 1280,
      screenY: 720,
    });
  });

  it("rejects NaN screen coordinates", () => {
    expect(readFiniteScreenPoint({ screenX: Number.NaN, screenY: 720 })).toBeNull();
    expect(readFiniteScreenPoint({ screenX: 1280, screenY: Number.NaN })).toBeNull();
  });

  it("rejects infinite screen coordinates", () => {
    expect(readFiniteScreenPoint({ screenX: Number.POSITIVE_INFINITY, screenY: 720 })).toBeNull();
    expect(readFiniteScreenPoint({ screenX: 1280, screenY: Number.NEGATIVE_INFINITY })).toBeNull();
  });

  it("rejects missing screen coordinates", () => {
    expect(readFiniteScreenPoint(undefined)).toBeNull();
    expect(readFiniteScreenPoint({ screenX: 1280 })).toBeNull();
    expect(readFiniteScreenPoint({ screenY: 720 })).toBeNull();
  });
});
