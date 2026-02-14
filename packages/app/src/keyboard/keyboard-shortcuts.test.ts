import { describe, expect, it } from "vitest";
import {
  resolveKeyboardShortcut,
  type KeyboardShortcutContext,
} from "./keyboard-shortcuts";

function keyboardEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    code: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides,
  } as KeyboardEvent;
}

function shortcutContext(
  overrides: Partial<KeyboardShortcutContext> = {}
): KeyboardShortcutContext {
  return {
    isMac: false,
    isTauri: false,
    focusScope: "other",
    commandCenterOpen: false,
    hasSelectedAgent: true,
    ...overrides,
  };
}

describe("keyboard-shortcuts", () => {
  it("matches Cmd+B sidebar toggle on macOS", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "b",
        code: "KeyB",
        metaKey: true,
      }),
      context: shortcutContext({ isMac: true }),
    });

    expect(match?.action).toBe("sidebar.toggle.left");
  });

  it("does not bind Ctrl+B on non-mac", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "b",
        code: "KeyB",
        ctrlKey: true,
      }),
      context: shortcutContext({ isMac: false }),
    });

    expect(match).toBeNull();
  });

  it("keeps Mod+. as sidebar toggle fallback", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: ".",
        code: "Period",
        ctrlKey: true,
      }),
      context: shortcutContext({ isMac: false }),
    });

    expect(match?.action).toBe("sidebar.toggle.left");
  });

  it("routes Mod+D to message-input action outside terminal", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "d",
        code: "KeyD",
        metaKey: true,
      }),
      context: shortcutContext({ isMac: true, focusScope: "message-input" }),
    });

    expect(match?.action).toBe("message-input.action");
    expect(match?.payload).toEqual({ kind: "dictation-toggle" });
  });

  it("does not route message-input actions when terminal is focused", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "d",
        code: "KeyD",
        metaKey: true,
      }),
      context: shortcutContext({ isMac: true, focusScope: "terminal" }),
    });

    expect(match).toBeNull();
  });

  it("parses Alt+digit sidebar shortcut payload", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "2",
        code: "Digit2",
        altKey: true,
      }),
      context: shortcutContext(),
    });

    expect(match?.action).toBe("sidebar.navigate.shortcut");
    expect(match?.payload).toEqual({ digit: 2 });
  });
});
