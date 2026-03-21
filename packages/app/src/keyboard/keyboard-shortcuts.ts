import type { ShortcutKey } from "@/utils/format-shortcut";
import type {
  KeyboardActionId,
  KeyboardFocusScope,
  KeyboardShortcutPayload,
  MessageInputKeyboardActionKind,
} from "@/keyboard/actions";

// --- Public types ---

export type KeyboardShortcutContext = {
  isMac: boolean;
  isDesktop: boolean;
  focusScope: KeyboardFocusScope;
  commandCenterOpen: boolean;
  hasSelectedAgent: boolean;
};

export type KeyboardShortcutMatch = {
  action: KeyboardActionId;
  payload: KeyboardShortcutPayload;
  preventDefault: boolean;
  stopPropagation: boolean;
};

export type KeyboardShortcutHelpRow = {
  id: string;
  label: string;
  keys: ShortcutKey[];
  note?: string;
};

export type KeyboardShortcutHelpSection = {
  id: "global" | "agent-input";
  title: string;
  rows: KeyboardShortcutHelpRow[];
};

// --- Binding definition types ---

type KeyboardShortcutPlatformContext = {
  isMac: boolean;
  isDesktop: boolean;
};

interface KeyCombo {
  /** Event.code to match. Use "Digit" for any digit 1-9. */
  code: string;
  /** Optional event.key fallback (case-insensitive). */
  key?: string;
  meta?: true;
  ctrl?: true;
  alt?: true;
  shift?: true;
  /** Set to false to block key repeat events. */
  repeat?: false;
}

interface ShortcutWhen {
  /** true = mac only, false = non-mac only */
  mac?: boolean;
  /** true = desktop only, false = web only */
  desktop?: boolean;
  /** false = disabled when terminal is focused */
  terminal?: false;
  /** false = disabled when command center is open */
  commandCenter?: false;
  /** true = requires a selected agent */
  hasSelectedAgent?: true;
  /** Exact focus scope match */
  focusScope?: KeyboardFocusScope;
}

type ShortcutPayloadDef =
  | { type: "index" }
  | { type: "delta"; delta: 1 | -1 }
  | { type: "message-input"; kind: MessageInputKeyboardActionKind };

interface ShortcutHelp {
  id: string;
  section: "global" | "agent-input";
  label: string;
  keys: ShortcutKey[];
  note?: string;
}

interface ShortcutBinding {
  id: string;
  action: KeyboardActionId;
  combo: KeyCombo;
  when?: ShortcutWhen;
  payload?: ShortcutPayloadDef;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  help?: ShortcutHelp;
}

// --- Constants ---

const SHORTCUT_HELP_SECTION_TITLES: Record<KeyboardShortcutHelpSection["id"], string> = {
  global: "Global",
  "agent-input": "Agent Input",
};

// --- Binding definitions ---

const SHORTCUT_BINDINGS: readonly ShortcutBinding[] = [
  // --- New agent ---
  {
    id: "agent-new-cmd-shift-o-mac",
    action: "agent.new",
    combo: { code: "KeyO", key: "o", meta: true, shift: true },
    when: { mac: true },
    help: {
      id: "new-agent",
      section: "global",
      label: "Open project",
      keys: ["mod", "shift", "O"],
    },
  },
  {
    id: "agent-new-ctrl-shift-o-non-mac",
    action: "agent.new",
    combo: { code: "KeyO", key: "o", ctrl: true, shift: true },
    when: { mac: false, terminal: false },
    help: {
      id: "new-agent",
      section: "global",
      label: "Open project",
      keys: ["mod", "shift", "O"],
    },
  },

  // --- Tab management ---
  {
    id: "workspace-tab-new-cmd-t-mac",
    action: "workspace.tab.new",
    combo: { code: "KeyT", key: "t", meta: true },
    when: { mac: true, commandCenter: false },
    help: {
      id: "workspace-tab-new",
      section: "global",
      label: "New agent tab",
      keys: ["mod", "T"],
    },
  },
  {
    id: "workspace-tab-new-ctrl-t-non-mac",
    action: "workspace.tab.new",
    combo: { code: "KeyT", key: "t", ctrl: true },
    when: { mac: false, commandCenter: false, terminal: false },
    help: {
      id: "workspace-tab-new",
      section: "global",
      label: "New agent tab",
      keys: ["mod", "T"],
    },
  },
  {
    id: "workspace-tab-close-current-cmd-w-mac",
    action: "workspace.tab.close.current",
    combo: { code: "KeyW", key: "w", meta: true },
    when: { mac: true, desktop: true, commandCenter: false },
    help: {
      id: "workspace-tab-close-current",
      section: "global",
      label: "Close current tab",
      keys: ["meta", "W"],
    },
  },
  {
    id: "workspace-tab-close-current-ctrl-w-non-mac",
    action: "workspace.tab.close.current",
    combo: { code: "KeyW", key: "w", ctrl: true },
    when: { mac: false, desktop: true, commandCenter: false, terminal: false },
    help: {
      id: "workspace-tab-close-current",
      section: "global",
      label: "Close current tab",
      keys: ["ctrl", "W"],
    },
  },
  {
    id: "workspace-tab-close-current-alt-shift-w-web",
    action: "workspace.tab.close.current",
    combo: { code: "KeyW", key: "w", alt: true, shift: true },
    when: { desktop: false, commandCenter: false },
    help: {
      id: "workspace-tab-close-current",
      section: "global",
      label: "Close current tab",
      keys: ["alt", "shift", "W"],
    },
  },

  // --- Workspace index jump ---
  {
    id: "workspace-navigate-index-cmd-digit-mac",
    action: "workspace.navigate.index",
    combo: { code: "Digit", meta: true },
    when: { mac: true, desktop: true, commandCenter: false },
    payload: { type: "index" },
    help: {
      id: "workspace-jump-index",
      section: "global",
      label: "Jump to workspace",
      keys: ["mod", "1-9"],
    },
  },
  {
    id: "workspace-navigate-index-ctrl-digit-non-mac",
    action: "workspace.navigate.index",
    combo: { code: "Digit", ctrl: true },
    when: { mac: false, desktop: true, commandCenter: false, terminal: false },
    payload: { type: "index" },
    help: {
      id: "workspace-jump-index",
      section: "global",
      label: "Jump to workspace",
      keys: ["mod", "1-9"],
    },
  },
  {
    id: "workspace-navigate-index-alt-digit-web",
    action: "workspace.navigate.index",
    combo: { code: "Digit", alt: true },
    when: { desktop: false, commandCenter: false },
    payload: { type: "index" },
    help: {
      id: "workspace-jump-index",
      section: "global",
      label: "Jump to workspace",
      keys: ["alt", "1-9"],
    },
  },

  // --- Tab index jump ---
  {
    id: "workspace-tab-navigate-index-alt-digit-desktop",
    action: "workspace.tab.navigate.index",
    combo: { code: "Digit", alt: true },
    when: { desktop: true, commandCenter: false },
    payload: { type: "index" },
    help: {
      id: "workspace-tab-jump-index",
      section: "global",
      label: "Jump to tab",
      keys: ["alt", "1-9"],
    },
  },
  {
    id: "workspace-tab-navigate-index-alt-shift-digit-web",
    action: "workspace.tab.navigate.index",
    combo: { code: "Digit", alt: true, shift: true },
    when: { desktop: false, commandCenter: false },
    payload: { type: "index" },
    help: {
      id: "workspace-tab-jump-index",
      section: "global",
      label: "Jump to tab",
      keys: ["alt", "shift", "1-9"],
    },
  },

  // --- Workspace relative navigation ---
  {
    id: "workspace-navigate-relative-cmd-left-mac",
    action: "workspace.navigate.relative",
    combo: { code: "BracketLeft", key: "[", meta: true },
    when: { mac: true, desktop: true, commandCenter: false },
    payload: { type: "delta", delta: -1 },
    help: {
      id: "workspace-prev",
      section: "global",
      label: "Previous workspace",
      keys: ["mod", "["],
    },
  },
  {
    id: "workspace-navigate-relative-ctrl-left-non-mac",
    action: "workspace.navigate.relative",
    combo: { code: "BracketLeft", key: "[", ctrl: true },
    when: { mac: false, desktop: true, commandCenter: false, terminal: false },
    payload: { type: "delta", delta: -1 },
    help: {
      id: "workspace-prev",
      section: "global",
      label: "Previous workspace",
      keys: ["mod", "["],
    },
  },
  {
    id: "workspace-navigate-relative-cmd-right-mac",
    action: "workspace.navigate.relative",
    combo: { code: "BracketRight", key: "]", meta: true },
    when: { mac: true, desktop: true, commandCenter: false },
    payload: { type: "delta", delta: 1 },
    help: {
      id: "workspace-next",
      section: "global",
      label: "Next workspace",
      keys: ["mod", "]"],
    },
  },
  {
    id: "workspace-navigate-relative-ctrl-right-non-mac",
    action: "workspace.navigate.relative",
    combo: { code: "BracketRight", key: "]", ctrl: true },
    when: { mac: false, desktop: true, commandCenter: false, terminal: false },
    payload: { type: "delta", delta: 1 },
    help: {
      id: "workspace-next",
      section: "global",
      label: "Next workspace",
      keys: ["mod", "]"],
    },
  },
  {
    id: "workspace-navigate-relative-alt-left-web",
    action: "workspace.navigate.relative",
    combo: { code: "BracketLeft", key: "[", alt: true },
    when: { desktop: false, commandCenter: false },
    payload: { type: "delta", delta: -1 },
    help: {
      id: "workspace-prev",
      section: "global",
      label: "Previous workspace",
      keys: ["alt", "["],
    },
  },
  {
    id: "workspace-navigate-relative-alt-right-web",
    action: "workspace.navigate.relative",
    combo: { code: "BracketRight", key: "]", alt: true },
    when: { desktop: false, commandCenter: false },
    payload: { type: "delta", delta: 1 },
    help: {
      id: "workspace-next",
      section: "global",
      label: "Next workspace",
      keys: ["alt", "]"],
    },
  },

  // --- Tab relative navigation ---
  {
    id: "workspace-tab-navigate-relative-alt-shift-left",
    action: "workspace.tab.navigate.relative",
    combo: { code: "BracketLeft", alt: true, shift: true },
    when: { commandCenter: false },
    payload: { type: "delta", delta: -1 },
    help: {
      id: "workspace-tab-prev",
      section: "global",
      label: "Previous tab",
      keys: ["alt", "shift", "["],
    },
  },
  {
    id: "workspace-tab-navigate-relative-alt-shift-right",
    action: "workspace.tab.navigate.relative",
    combo: { code: "BracketRight", alt: true, shift: true },
    when: { commandCenter: false },
    payload: { type: "delta", delta: 1 },
    help: {
      id: "workspace-tab-next",
      section: "global",
      label: "Next tab",
      keys: ["alt", "shift", "]"],
    },
  },

  // --- Pane management (mac only) ---
  {
    id: "workspace-pane-split-right-cmd-backslash",
    action: "workspace.pane.split.right",
    combo: { code: "Backslash", meta: true },
    when: { mac: true, terminal: false, commandCenter: false },
    help: {
      id: "workspace-pane-split-right",
      section: "global",
      label: "Split pane right",
      keys: ["mod", "\\"],
    },
  },
  {
    id: "workspace-pane-split-down-cmd-shift-backslash",
    action: "workspace.pane.split.down",
    combo: { code: "Backslash", meta: true, shift: true },
    when: { mac: true, terminal: false, commandCenter: false },
    help: {
      id: "workspace-pane-split-down",
      section: "global",
      label: "Split pane down",
      keys: ["mod", "shift", "\\"],
    },
  },
  {
    id: "workspace-pane-focus-left-cmd-shift-left",
    action: "workspace.pane.focus.left",
    combo: { code: "ArrowLeft", meta: true, shift: true },
    when: { mac: true, terminal: false, commandCenter: false },
    help: {
      id: "workspace-pane-focus-left",
      section: "global",
      label: "Focus pane left",
      keys: ["mod", "shift", "Left"],
    },
  },
  {
    id: "workspace-pane-focus-right-cmd-shift-right",
    action: "workspace.pane.focus.right",
    combo: { code: "ArrowRight", meta: true, shift: true },
    when: { mac: true, terminal: false, commandCenter: false },
    help: {
      id: "workspace-pane-focus-right",
      section: "global",
      label: "Focus pane right",
      keys: ["mod", "shift", "Right"],
    },
  },
  {
    id: "workspace-pane-focus-up-cmd-shift-up",
    action: "workspace.pane.focus.up",
    combo: { code: "ArrowUp", meta: true, shift: true },
    when: { mac: true, terminal: false, commandCenter: false },
    help: {
      id: "workspace-pane-focus-up",
      section: "global",
      label: "Focus pane up",
      keys: ["mod", "shift", "Up"],
    },
  },
  {
    id: "workspace-pane-focus-down-cmd-shift-down",
    action: "workspace.pane.focus.down",
    combo: { code: "ArrowDown", meta: true, shift: true },
    when: { mac: true, terminal: false, commandCenter: false },
    help: {
      id: "workspace-pane-focus-down",
      section: "global",
      label: "Focus pane down",
      keys: ["mod", "shift", "Down"],
    },
  },
  {
    id: "workspace-pane-move-tab-left-cmd-shift-alt-left",
    action: "workspace.pane.move-tab.left",
    combo: { code: "ArrowLeft", meta: true, alt: true, shift: true },
    when: { mac: true, terminal: false, commandCenter: false },
    help: {
      id: "workspace-pane-move-tab-left",
      section: "global",
      label: "Move tab left",
      keys: ["mod", "shift", "alt", "Left"],
    },
  },
  {
    id: "workspace-pane-move-tab-right-cmd-shift-alt-right",
    action: "workspace.pane.move-tab.right",
    combo: { code: "ArrowRight", meta: true, alt: true, shift: true },
    when: { mac: true, terminal: false, commandCenter: false },
    help: {
      id: "workspace-pane-move-tab-right",
      section: "global",
      label: "Move tab right",
      keys: ["mod", "shift", "alt", "Right"],
    },
  },
  {
    id: "workspace-pane-move-tab-up-cmd-shift-alt-up",
    action: "workspace.pane.move-tab.up",
    combo: { code: "ArrowUp", meta: true, alt: true, shift: true },
    when: { mac: true, terminal: false, commandCenter: false },
    help: {
      id: "workspace-pane-move-tab-up",
      section: "global",
      label: "Move tab up",
      keys: ["mod", "shift", "alt", "Up"],
    },
  },
  {
    id: "workspace-pane-move-tab-down-cmd-shift-alt-down",
    action: "workspace.pane.move-tab.down",
    combo: { code: "ArrowDown", meta: true, alt: true, shift: true },
    when: { mac: true, terminal: false, commandCenter: false },
    help: {
      id: "workspace-pane-move-tab-down",
      section: "global",
      label: "Move tab down",
      keys: ["mod", "shift", "alt", "Down"],
    },
  },
  {
    id: "workspace-pane-close-cmd-shift-w",
    action: "workspace.pane.close",
    combo: { code: "KeyW", key: "w", meta: true, shift: true },
    when: { mac: true, terminal: false, commandCenter: false },
    help: {
      id: "workspace-pane-close",
      section: "global",
      label: "Close pane",
      keys: ["mod", "shift", "W"],
    },
  },

  // --- Command center ---
  {
    id: "command-center-toggle-cmd-k-mac",
    action: "command-center.toggle",
    combo: { code: "KeyK", key: "k", meta: true },
    when: { mac: true },
    help: {
      id: "toggle-command-center",
      section: "global",
      label: "Toggle command center",
      keys: ["mod", "K"],
    },
  },
  {
    id: "command-center-toggle-ctrl-k-non-mac",
    action: "command-center.toggle",
    combo: { code: "KeyK", key: "k", ctrl: true },
    when: { mac: false, terminal: false },
    help: {
      id: "toggle-command-center",
      section: "global",
      label: "Toggle command center",
      keys: ["mod", "K"],
    },
  },

  // --- Keyboard shortcuts dialog ---
  {
    id: "shortcuts-dialog-toggle-question-mark",
    action: "shortcuts.dialog.toggle",
    combo: { code: "Slash", key: "?", shift: true, repeat: false },
    when: { focusScope: "other" },
    help: {
      id: "show-shortcuts",
      section: "global",
      label: "Show keyboard shortcuts",
      keys: ["?"],
      note: "Available when focus is not in a text field or terminal.",
    },
  },

  // --- Sidebar toggles ---
  {
    id: "sidebar-toggle-left-mac-cmd-b",
    action: "sidebar.toggle.left",
    combo: { code: "KeyB", key: "b", meta: true },
    when: { mac: true },
    help: {
      id: "toggle-left-sidebar",
      section: "global",
      label: "Toggle left sidebar",
      keys: ["mod", "B"],
    },
  },
  {
    id: "sidebar-toggle-left-cmd-period-mac",
    action: "sidebar.toggle.left",
    combo: { code: "Period", key: ".", meta: true },
    when: { mac: true, commandCenter: false },
  },
  {
    id: "sidebar-toggle-left-ctrl-period-non-mac",
    action: "sidebar.toggle.left",
    combo: { code: "Period", key: ".", ctrl: true },
    when: { mac: false, commandCenter: false, terminal: false },
    help: {
      id: "toggle-left-sidebar",
      section: "global",
      label: "Toggle left sidebar",
      keys: ["mod", "."],
    },
  },
  {
    id: "sidebar-toggle-right-cmd-e-mac",
    action: "sidebar.toggle.right",
    combo: { code: "KeyE", key: "e", meta: true },
    when: { mac: true, hasSelectedAgent: true, commandCenter: false },
    help: {
      id: "toggle-right-sidebar",
      section: "global",
      label: "Toggle right sidebar",
      keys: ["mod", "E"],
    },
  },
  {
    id: "sidebar-toggle-right-ctrl-e-non-mac",
    action: "sidebar.toggle.right",
    combo: { code: "KeyE", key: "e", ctrl: true },
    when: { mac: false, hasSelectedAgent: true, commandCenter: false, terminal: false },
    help: {
      id: "toggle-right-sidebar",
      section: "global",
      label: "Toggle right sidebar",
      keys: ["mod", "E"],
    },
  },
  {
    id: "sidebar-toggle-right-ctrl-backquote",
    action: "sidebar.toggle.right",
    combo: { code: "Backquote", key: "`", ctrl: true },
    when: { hasSelectedAgent: true, commandCenter: false },
  },

  // --- Message input ---
  {
    id: "message-input-voice-toggle-cmd-shift-d-mac",
    action: "message-input.action",
    combo: { code: "KeyD", key: "d", meta: true, shift: true, repeat: false },
    when: { mac: true, commandCenter: false, terminal: false },
    payload: { type: "message-input", kind: "voice-toggle" },
    help: {
      id: "voice-toggle",
      section: "agent-input",
      label: "Toggle voice mode",
      keys: ["mod", "shift", "D"],
    },
  },
  {
    id: "message-input-voice-toggle-ctrl-shift-d-non-mac",
    action: "message-input.action",
    combo: { code: "KeyD", key: "d", ctrl: true, shift: true, repeat: false },
    when: { mac: false, commandCenter: false, terminal: false },
    payload: { type: "message-input", kind: "voice-toggle" },
    help: {
      id: "voice-toggle",
      section: "agent-input",
      label: "Toggle voice mode",
      keys: ["mod", "shift", "D"],
    },
  },
  {
    id: "message-input-dictation-toggle-cmd-d-mac",
    action: "message-input.action",
    combo: { code: "KeyD", key: "d", meta: true },
    when: { mac: true, commandCenter: false, terminal: false },
    payload: { type: "message-input", kind: "dictation-toggle" },
    help: {
      id: "dictation-toggle",
      section: "agent-input",
      label: "Start/stop dictation",
      keys: ["mod", "D"],
    },
  },
  {
    id: "message-input-dictation-toggle-ctrl-d-non-mac",
    action: "message-input.action",
    combo: { code: "KeyD", key: "d", ctrl: true },
    when: { mac: false, commandCenter: false, terminal: false },
    payload: { type: "message-input", kind: "dictation-toggle" },
    help: {
      id: "dictation-toggle",
      section: "agent-input",
      label: "Start/stop dictation",
      keys: ["mod", "D"],
    },
  },
  {
    id: "message-input-dictation-cancel",
    action: "message-input.action",
    combo: { code: "Escape" },
    when: { commandCenter: false, terminal: false },
    payload: { type: "message-input", kind: "dictation-cancel" },
    preventDefault: false,
    stopPropagation: false,
    help: {
      id: "dictation-cancel",
      section: "agent-input",
      label: "Cancel dictation",
      keys: ["Esc"],
    },
  },
  {
    id: "message-input-voice-mute-toggle",
    action: "message-input.action",
    combo: { code: "Space", key: " ", repeat: false },
    when: { commandCenter: false, focusScope: "other" },
    payload: { type: "message-input", kind: "voice-mute-toggle" },
    help: {
      id: "voice-mute-toggle",
      section: "agent-input",
      label: "Mute/unmute voice mode",
      keys: ["Space"],
    },
  },
];

// --- Matching engine ---

function parseDigit(event: KeyboardEvent): number | null {
  const code = event.code ?? "";
  if (code.startsWith("Digit")) {
    const value = Number(code.slice("Digit".length));
    return Number.isFinite(value) && value >= 1 && value <= 9 ? value : null;
  }
  if (code.startsWith("Numpad")) {
    const value = Number(code.slice("Numpad".length));
    return Number.isFinite(value) && value >= 1 && value <= 9 ? value : null;
  }
  const key = event.key ?? "";
  if (key >= "1" && key <= "9") {
    return Number(key);
  }
  return null;
}

function matchesCombo(combo: KeyCombo, event: KeyboardEvent): boolean {
  if (!!combo.meta !== event.metaKey) return false;
  if (!!combo.ctrl !== event.ctrlKey) return false;
  if (!!combo.alt !== event.altKey) return false;
  if (!!combo.shift !== event.shiftKey) return false;
  if (combo.repeat === false && event.repeat) return false;

  if (combo.code === "Digit") {
    return parseDigit(event) !== null;
  }

  const codeMatch = event.code === combo.code;
  const keyMatch = combo.key !== undefined && event.key.toLowerCase() === combo.key.toLowerCase();
  return codeMatch || keyMatch;
}

function matchesWhen(when: ShortcutWhen | undefined, context: KeyboardShortcutContext): boolean {
  if (!when) return true;
  if (when.mac !== undefined && when.mac !== context.isMac) return false;
  if (when.desktop !== undefined && when.desktop !== context.isDesktop) return false;
  if (when.terminal === false && context.focusScope === "terminal") return false;
  if (when.commandCenter === false && context.commandCenterOpen) return false;
  if (when.hasSelectedAgent === true && !context.hasSelectedAgent) return false;
  if (when.focusScope !== undefined && context.focusScope !== when.focusScope) return false;
  return true;
}

function resolvePayload(
  def: ShortcutPayloadDef | undefined,
  event: KeyboardEvent,
): KeyboardShortcutPayload {
  if (!def) return null;
  switch (def.type) {
    case "index": {
      const index = parseDigit(event);
      return index ? { index } : null;
    }
    case "delta":
      return { delta: def.delta };
    case "message-input":
      return { kind: def.kind };
  }
}

function helpMatchesPlatform(
  when: ShortcutWhen | undefined,
  context: KeyboardShortcutPlatformContext,
): boolean {
  if (when?.mac !== undefined && when.mac !== context.isMac) return false;
  if (when?.desktop !== undefined && when.desktop !== context.isDesktop) return false;
  return true;
}

// --- Public API ---

export function resolveKeyboardShortcut(input: {
  event: KeyboardEvent;
  context: KeyboardShortcutContext;
}): KeyboardShortcutMatch | null {
  const { event, context } = input;
  for (const binding of SHORTCUT_BINDINGS) {
    if (!matchesCombo(binding.combo, event)) {
      continue;
    }
    if (!matchesWhen(binding.when, context)) {
      continue;
    }
    return {
      action: binding.action,
      payload: resolvePayload(binding.payload, event),
      preventDefault: binding.preventDefault ?? true,
      stopPropagation: binding.stopPropagation ?? true,
    };
  }
  return null;
}

export function buildKeyboardShortcutHelpSections(
  input: KeyboardShortcutPlatformContext,
): KeyboardShortcutHelpSection[] {
  const seenRows = new Set<string>();
  const rowsBySection = new Map<KeyboardShortcutHelpSection["id"], KeyboardShortcutHelpRow[]>([
    ["global", []],
    ["agent-input", []],
  ]);

  for (const binding of SHORTCUT_BINDINGS) {
    const help = binding.help;
    if (!help) {
      continue;
    }
    if (!helpMatchesPlatform(binding.when, input)) {
      continue;
    }
    const rowKey = `${help.section}:${help.id}`;
    if (seenRows.has(rowKey)) {
      continue;
    }
    seenRows.add(rowKey);

    const rows = rowsBySection.get(help.section);
    if (!rows) {
      continue;
    }
    rows.push({
      id: help.id,
      label: help.label,
      keys: help.keys,
      ...(help.note ? { note: help.note } : {}),
    });
  }

  const sectionOrder: KeyboardShortcutHelpSection["id"][] = ["global", "agent-input"];

  return sectionOrder.flatMap((sectionId) => {
    const rows = rowsBySection.get(sectionId) ?? [];
    if (rows.length === 0) {
      return [];
    }
    return [
      {
        id: sectionId,
        title: SHORTCUT_HELP_SECTION_TITLES[sectionId],
        rows,
      },
    ];
  });
}
