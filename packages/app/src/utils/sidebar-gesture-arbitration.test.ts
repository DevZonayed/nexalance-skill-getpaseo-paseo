import { describe, expect, it } from "vitest";

import {
  decideLongPressMove,
  shouldOpenContextMenuOnPressOut,
} from "./sidebar-gesture-arbitration";

describe("decideLongPressMove", () => {
  it("keeps long press pending for small movement before long-press arm", () => {
    expect(
      decideLongPressMove({
        longPressArmed: false,
        didStartDrag: false,
        startPoint: { x: 0, y: 0 },
        currentPoint: { x: 3, y: 2 },
      })
    ).toBe("none");
  });

  it("cancels long press when movement exceeds cancel slop before arm", () => {
    expect(
      decideLongPressMove({
        longPressArmed: false,
        didStartDrag: false,
        startPoint: { x: 0, y: 0 },
        currentPoint: { x: 12, y: 0 },
      })
    ).toBe("cancel_long_press");
  });

  it("starts drag when movement exceeds drag slop after long-press arm", () => {
    expect(
      decideLongPressMove({
        longPressArmed: true,
        didStartDrag: false,
        startPoint: { x: 0, y: 0 },
        currentPoint: { x: 0, y: 9 },
      })
    ).toBe("start_drag");
  });

  it("does nothing when drag already started", () => {
    expect(
      decideLongPressMove({
        longPressArmed: true,
        didStartDrag: true,
        startPoint: { x: 0, y: 0 },
        currentPoint: { x: 20, y: 20 },
      })
    ).toBe("none");
  });
});

describe("shouldOpenContextMenuOnPressOut", () => {
  it("opens menu only when long-press is armed and drag did not start", () => {
    expect(
      shouldOpenContextMenuOnPressOut({
        longPressArmed: true,
        didStartDrag: false,
      })
    ).toBe(true);

    expect(
      shouldOpenContextMenuOnPressOut({
        longPressArmed: false,
        didStartDrag: false,
      })
    ).toBe(false);

    expect(
      shouldOpenContextMenuOnPressOut({
        longPressArmed: true,
        didStartDrag: true,
      })
    ).toBe(false);
  });
});

