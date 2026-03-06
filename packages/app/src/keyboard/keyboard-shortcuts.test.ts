import { describe, expect, it } from "vitest";
import {
  buildKeyboardShortcutHelpSections,
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
  it("matches Mod+Shift+O to create new agent", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "O",
        code: "KeyO",
        metaKey: true,
        shiftKey: true,
      }),
      context: shortcutContext({ isMac: true }),
    });

    expect(match?.action).toBe("agent.new");
  });

  it("does not keep old Mod+Alt+N binding", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "n",
        code: "KeyN",
        metaKey: true,
        altKey: true,
      }),
      context: shortcutContext({ isMac: true }),
    });

    expect(match).toBeNull();
  });

  it("matches question-mark shortcut to toggle the shortcuts dialog", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "?",
        code: "Slash",
        shiftKey: true,
      }),
      context: shortcutContext({ focusScope: "other" }),
    });

    expect(match?.action).toBe("shortcuts.dialog.toggle");
  });

  it("does not match question-mark shortcut inside editable scopes", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "?",
        code: "Slash",
        shiftKey: true,
      }),
      context: shortcutContext({ focusScope: "message-input" }),
    });

    expect(match).toBeNull();
  });

  it("matches workspace index jump on web via Alt+digit", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "2",
        code: "Digit2",
        altKey: true,
      }),
      context: shortcutContext({ isTauri: false }),
    });

    expect(match?.action).toBe("workspace.navigate.index");
    expect(match?.payload).toEqual({ index: 2 });
  });

  it("matches workspace index jump on tauri via Mod+digit", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "2",
        code: "Digit2",
        metaKey: true,
      }),
      context: shortcutContext({ isMac: true, isTauri: true }),
    });

    expect(match?.action).toBe("workspace.navigate.index");
    expect(match?.payload).toEqual({ index: 2 });
  });

  it("matches tab index jump on tauri via Alt+digit", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "2",
        code: "Digit2",
        altKey: true,
      }),
      context: shortcutContext({ isTauri: true }),
    });

    expect(match?.action).toBe("workspace.tab.navigate.index");
    expect(match?.payload).toEqual({ index: 2 });
  });

  it("matches tab index jump on web via Alt+Shift+digit", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "@",
        code: "Digit2",
        altKey: true,
        shiftKey: true,
      }),
      context: shortcutContext({ isTauri: false }),
    });

    expect(match?.action).toBe("workspace.tab.navigate.index");
    expect(match?.payload).toEqual({ index: 2 });
  });

  it("matches workspace relative navigation on web via Alt+[", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "[",
        code: "BracketLeft",
        altKey: true,
      }),
      context: shortcutContext({ isTauri: false }),
    });

    expect(match?.action).toBe("workspace.navigate.relative");
    expect(match?.payload).toEqual({ delta: -1 });
  });

  it("matches workspace relative navigation on tauri via Mod+]", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "]",
        code: "BracketRight",
        ctrlKey: true,
      }),
      context: shortcutContext({ isTauri: true }),
    });

    expect(match?.action).toBe("workspace.navigate.relative");
    expect(match?.payload).toEqual({ delta: 1 });
  });

  it("matches tab relative navigation via Alt+Shift+]", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "}",
        code: "BracketRight",
        altKey: true,
        shiftKey: true,
      }),
      context: shortcutContext(),
    });

    expect(match?.action).toBe("workspace.tab.navigate.relative");
    expect(match?.payload).toEqual({ delta: 1 });
  });

  it("matches Alt+Shift+T to open new tab", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "T",
        code: "KeyT",
        altKey: true,
        shiftKey: true,
      }),
      context: shortcutContext(),
    });

    expect(match?.action).toBe("workspace.tab.new");
  });

  it("matches Alt+Shift+W to close current tab on web", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "W",
        code: "KeyW",
        altKey: true,
        shiftKey: true,
      }),
      context: shortcutContext({ isTauri: false }),
    });

    expect(match?.action).toBe("workspace.tab.close.current");
  });

  it("matches Mod+W to close current tab on tauri", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "w",
        code: "KeyW",
        metaKey: true,
      }),
      context: shortcutContext({ isMac: true, isTauri: true }),
    });

    expect(match?.action).toBe("workspace.tab.close.current");
  });

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

  it("keeps space typing available in message input", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: " ",
        code: "Space",
      }),
      context: shortcutContext({ focusScope: "message-input" }),
    });

    expect(match).toBeNull();
  });

  it("routes space to voice mute toggle outside editable scopes", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: " ",
        code: "Space",
      }),
      context: shortcutContext({ focusScope: "other" }),
    });

    expect(match?.action).toBe("message-input.action");
    expect(match?.payload).toEqual({ kind: "voice-mute-toggle" });
  });

  it("lets Escape continue to local handlers while routing dictation cancel", () => {
    const match = resolveKeyboardShortcut({
      event: keyboardEvent({
        key: "Escape",
        code: "Escape",
      }),
      context: shortcutContext({ focusScope: "message-input" }),
    });

    expect(match?.action).toBe("message-input.action");
    expect(match?.payload).toEqual({ kind: "dictation-cancel" });
    expect(match?.preventDefault).toBe(false);
    expect(match?.stopPropagation).toBe(false);
  });
});

describe("keyboard-shortcut help sections", () => {
  function findRow(
    sections: ReturnType<typeof buildKeyboardShortcutHelpSections>,
    id: string
  ) {
    for (const section of sections) {
      const row = section.rows.find((candidate) => candidate.id === id);
      if (row) {
        return row;
      }
    }
    return null;
  }

  it("uses web defaults for workspace and tab jump", () => {
    const sections = buildKeyboardShortcutHelpSections({
      isMac: true,
      isTauri: false,
    });

    expect(findRow(sections, "new-agent")?.keys).toEqual(["mod", "shift", "O"]);
    expect(findRow(sections, "workspace-jump-index")?.keys).toEqual(["alt", "1-9"]);
    expect(findRow(sections, "workspace-tab-jump-index")?.keys).toEqual([
      "alt",
      "shift",
      "1-9",
    ]);
    expect(findRow(sections, "workspace-tab-close-current")?.keys).toEqual([
      "alt",
      "shift",
      "W",
    ]);
  });

  it("uses tauri defaults for workspace and tab jump", () => {
    const sections = buildKeyboardShortcutHelpSections({
      isMac: true,
      isTauri: true,
    });

    expect(findRow(sections, "new-agent")?.keys).toEqual(["mod", "shift", "O"]);
    expect(findRow(sections, "workspace-jump-index")?.keys).toEqual(["mod", "1-9"]);
    expect(findRow(sections, "workspace-tab-jump-index")?.keys).toEqual(["alt", "1-9"]);
    expect(findRow(sections, "workspace-tab-close-current")?.keys).toEqual([
      "mod",
      "W",
    ]);
  });

  it("uses mod+period as non-mac left sidebar shortcut", () => {
    const sections = buildKeyboardShortcutHelpSections({
      isMac: false,
      isTauri: false,
    });

    expect(findRow(sections, "toggle-left-sidebar")?.keys).toEqual([
      "mod",
      ".",
    ]);
  });
});
