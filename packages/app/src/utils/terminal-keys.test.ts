import { describe, expect, it } from "vitest";
import {
  hasPendingTerminalModifiers,
  isTerminalModifierDomKey,
  mapTerminalDataToKey,
  mergeTerminalModifiers,
  normalizeDomTerminalKey,
  normalizeTerminalTransportKey,
  shouldInterceptDomTerminalKey,
} from "./terminal-keys";

describe("terminal key helpers", () => {
  it("normalizes supported DOM keys", () => {
    expect(normalizeDomTerminalKey("Esc")).toBe("Escape");
    expect(normalizeDomTerminalKey(" ")).toBe(" ");
    expect(normalizeDomTerminalKey("ArrowUp")).toBe("ArrowUp");
    expect(normalizeDomTerminalKey("F12")).toBe("F12");
  });

  it("filters unsupported and composing DOM keys", () => {
    expect(normalizeDomTerminalKey("Dead")).toBeNull();
    expect(normalizeDomTerminalKey("Unidentified")).toBeNull();
    expect(normalizeDomTerminalKey("MediaPlayPause")).toBeNull();
  });

  it("detects modifier DOM keys", () => {
    expect(isTerminalModifierDomKey("Control")).toBe(true);
    expect(isTerminalModifierDomKey("Shift")).toBe(true);
    expect(isTerminalModifierDomKey("a")).toBe(false);
  });

  it("lowercases printable transport keys", () => {
    expect(normalizeTerminalTransportKey("C")).toBe("c");
    expect(normalizeTerminalTransportKey("Escape")).toBe("Escape");
  });

  it("merges pending modifiers with native key modifiers", () => {
    expect(
      mergeTerminalModifiers({
        pendingModifiers: { ctrl: true, shift: false, alt: true },
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        metaKey: false,
      })
    ).toEqual({
      ctrl: true,
      shift: true,
      alt: true,
      meta: false,
    });
  });

  it("intercepts special keys and modifier combos", () => {
    expect(
      shouldInterceptDomTerminalKey({
        key: "Escape",
        ctrlKey: false,
        altKey: false,
        pendingModifiers: { ctrl: false, shift: false, alt: false },
      })
    ).toBe(true);
    expect(
      shouldInterceptDomTerminalKey({
        key: "c",
        ctrlKey: true,
        altKey: false,
        pendingModifiers: { ctrl: false, shift: false, alt: false },
      })
    ).toBe(true);
    expect(
      shouldInterceptDomTerminalKey({
        key: "c",
        ctrlKey: false,
        altKey: false,
        pendingModifiers: { ctrl: false, shift: false, alt: false },
      })
    ).toBe(false);
  });

  it("detects pending modifier state", () => {
    expect(hasPendingTerminalModifiers({ ctrl: false, shift: false, alt: false })).toBe(
      false
    );
    expect(hasPendingTerminalModifiers({ ctrl: true, shift: false, alt: false })).toBe(
      true
    );
  });

  it("maps onData bytes to terminal keys for modifier fallback", () => {
    expect(mapTerminalDataToKey("c")).toBe("c");
    expect(mapTerminalDataToKey("\r")).toBe("Enter");
    expect(mapTerminalDataToKey("\t")).toBe("Tab");
    expect(mapTerminalDataToKey("\x7f")).toBe("Backspace");
    expect(mapTerminalDataToKey("\x1b")).toBe("Escape");
    expect(mapTerminalDataToKey("\x03")).toBeNull();
    expect(mapTerminalDataToKey("")).toBeNull();
  });
});
