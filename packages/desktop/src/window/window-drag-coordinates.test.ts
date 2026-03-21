import { describe, expect, it } from "vitest";

import {
  createWindowMoveState,
  readWindowMovePayload,
  resolveWindowMovePosition,
} from "./window-drag-coordinates";

describe("window-drag-coordinates", () => {
  describe("readWindowMovePayload", () => {
    it("returns finite screen coordinates", () => {
      expect(readWindowMovePayload({ screenX: 1500, screenY: 900 })).toEqual({
        screenX: 1500,
        screenY: 900,
      });
    });

    it("rejects non-finite screen coordinates", () => {
      expect(readWindowMovePayload({ screenX: Number.NaN, screenY: 900 })).toBeNull();
      expect(
        readWindowMovePayload({ screenX: 1500, screenY: Number.POSITIVE_INFINITY }),
      ).toBeNull();
    });
  });

  describe("createWindowMoveState", () => {
    it("derives finite offsets from the window position", () => {
      expect(
        createWindowMoveState({
          payload: { screenX: 1500, screenY: 900 },
          windowX: 1200,
          windowY: 700,
        }),
      ).toEqual({
        offsetX: 300,
        offsetY: 200,
      });
    });

    it("rejects non-finite offsets", () => {
      expect(
        createWindowMoveState({
          payload: { screenX: 1500, screenY: 900 },
          windowX: Number.NaN,
          windowY: 700,
        }),
      ).toBeNull();
    });
  });

  describe("resolveWindowMovePosition", () => {
    it("rounds the next window position", () => {
      expect(
        resolveWindowMovePosition({
          payload: { screenX: 1501.4, screenY: 902.6 },
          state: { offsetX: 300, offsetY: 200 },
        }),
      ).toEqual({
        x: 1201,
        y: 703,
      });
    });

    it("rejects non-finite next positions", () => {
      expect(
        resolveWindowMovePosition({
          payload: { screenX: 1500, screenY: 900 },
          state: { offsetX: Number.NaN, offsetY: 200 },
        }),
      ).toBeNull();
    });
  });
});
