import { describe, expect, it } from "vitest";

import { getTitleBarOverlayOptions, readBadgeCount, readWindowTheme } from "./window-manager";

describe("window-manager", () => {
  describe("readBadgeCount", () => {
    it("returns valid non-negative integers", () => {
      expect(readBadgeCount(0)).toBe(0);
      expect(readBadgeCount(3)).toBe(3);
    });

    it("falls back to zero for invalid payloads", () => {
      expect(readBadgeCount(undefined)).toBe(0);
      expect(readBadgeCount(null)).toBe(0);
      expect(readBadgeCount(Number.NaN)).toBe(0);
      expect(readBadgeCount(Number.POSITIVE_INFINITY)).toBe(0);
      expect(readBadgeCount(-1)).toBe(0);
      expect(readBadgeCount(1.5)).toBe(0);
      expect(readBadgeCount("2")).toBe(0);
      expect(readBadgeCount({ count: 2 })).toBe(0);
    });
  });

  describe("readWindowTheme", () => {
    it("accepts supported title bar themes", () => {
      expect(readWindowTheme("light")).toBe("light");
      expect(readWindowTheme("dark")).toBe("dark");
    });

    it("rejects invalid title bar themes", () => {
      expect(readWindowTheme(undefined)).toBeNull();
      expect(readWindowTheme("auto")).toBeNull();
      expect(readWindowTheme("system")).toBeNull();
    });
  });

  describe("getTitleBarOverlayOptions", () => {
    it("returns light title bar overlay colors", () => {
      expect(getTitleBarOverlayOptions("light")).toEqual({
        color: "#ffffff",
        symbolColor: "#09090b",
        height: 48,
      });
    });

    it("returns dark title bar overlay colors", () => {
      expect(getTitleBarOverlayOptions("dark")).toEqual({
        color: "#18181c",
        symbolColor: "#e4e4e7",
        height: 48,
      });
    });
  });
});
