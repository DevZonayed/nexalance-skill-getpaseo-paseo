import type {
  KeyboardActionId,
  KeyboardFocusScope,
  KeyboardShortcutPayload,
  MessageInputKeyboardActionKind,
} from "@/keyboard/actions";

export type KeyboardShortcutContext = {
  isMac: boolean;
  isTauri: boolean;
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

type KeyboardShortcutBinding = {
  id: string;
  action: KeyboardActionId;
  matches: (event: KeyboardEvent) => boolean;
  when: (context: KeyboardShortcutContext) => boolean;
  payload?: (event: KeyboardEvent) => KeyboardShortcutPayload;
  preventDefault?: boolean;
  stopPropagation?: boolean;
};

function isMod(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

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

function hasDigit(event: KeyboardEvent): boolean {
  return parseDigit(event) !== null;
}

function isQuestionMarkShortcut(event: KeyboardEvent): boolean {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.shiftKey &&
    !event.repeat &&
    (event.key === "?" || event.code === "Slash")
  );
}

function withMessageInputAction(
  kind: MessageInputKeyboardActionKind
): (event: KeyboardEvent) => KeyboardShortcutPayload {
  return () => ({ kind });
}

const SHORTCUT_BINDINGS: readonly KeyboardShortcutBinding[] = [
  {
    id: "agent-new-mod-alt-n",
    action: "agent.new",
    matches: (event) =>
      isMod(event) &&
      event.altKey &&
      !event.shiftKey &&
      (event.code === "KeyN" || event.key.toLowerCase() === "n"),
    when: () => true,
  },
  {
    id: "agent-new-tauri-mod-n",
    action: "agent.new",
    matches: (event) =>
      isMod(event) &&
      !event.altKey &&
      !event.shiftKey &&
      (event.code === "KeyN" || event.key.toLowerCase() === "n"),
    when: (context) => context.isTauri,
  },
  {
    id: "command-center-toggle",
    action: "command-center.toggle",
    matches: (event) =>
      isMod(event) &&
      !event.altKey &&
      !event.shiftKey &&
      (event.code === "KeyK" || event.key.toLowerCase() === "k"),
    when: () => true,
  },
  {
    id: "shortcuts-dialog-toggle-question-mark",
    action: "shortcuts.dialog.toggle",
    matches: isQuestionMarkShortcut,
    when: (context) => context.focusScope === "other",
  },
  {
    id: "sidebar-toggle-left-mac-cmd-b",
    action: "sidebar.toggle.left",
    matches: (event) =>
      event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      (event.code === "KeyB" || event.key.toLowerCase() === "b"),
    when: (context) => context.isMac,
  },
  {
    id: "sidebar-toggle-left-mod-period",
    action: "sidebar.toggle.left",
    matches: (event) =>
      isMod(event) &&
      !event.altKey &&
      !event.shiftKey &&
      (event.code === "Period" || event.key === "."),
    when: (context) => !context.commandCenterOpen,
  },
  {
    id: "sidebar-toggle-right-mod-e",
    action: "sidebar.toggle.right",
    matches: (event) =>
      isMod(event) &&
      !event.altKey &&
      !event.shiftKey &&
      (event.code === "KeyE" || event.key.toLowerCase() === "e"),
    when: (context) => context.hasSelectedAgent && !context.commandCenterOpen,
  },
  {
    id: "sidebar-toggle-right-ctrl-backquote",
    action: "sidebar.toggle.right",
    matches: (event) =>
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      (event.code === "Backquote" || event.key === "`"),
    when: (context) => context.hasSelectedAgent && !context.commandCenterOpen,
  },
  {
    id: "message-input-voice-toggle",
    action: "message-input.action",
    matches: (event) =>
      isMod(event) &&
      event.shiftKey &&
      !event.altKey &&
      (event.code === "KeyD" || event.key.toLowerCase() === "d") &&
      !event.repeat,
    payload: withMessageInputAction("voice-toggle"),
    when: (context) =>
      !context.commandCenterOpen && context.focusScope !== "terminal",
  },
  {
    id: "message-input-dictation-toggle",
    action: "message-input.action",
    matches: (event) =>
      isMod(event) &&
      !event.shiftKey &&
      !event.altKey &&
      (event.code === "KeyD" || event.key.toLowerCase() === "d"),
    payload: withMessageInputAction("dictation-toggle"),
    when: (context) =>
      !context.commandCenterOpen && context.focusScope !== "terminal",
  },
  {
    id: "message-input-dictation-cancel",
    action: "message-input.action",
    matches: (event) => event.key === "Escape",
    payload: withMessageInputAction("dictation-cancel"),
    when: (context) =>
      !context.commandCenterOpen && context.focusScope !== "terminal",
  },
  {
    id: "message-input-voice-mute-toggle",
    action: "message-input.action",
    matches: (event) =>
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      (event.code === "Space" || event.key === " ") &&
      !event.repeat,
    payload: withMessageInputAction("voice-mute-toggle"),
    when: (context) =>
      !context.commandCenterOpen && context.focusScope === "other",
  },
  {
    id: "sidebar-shortcut-alt-digit",
    action: "sidebar.navigate.shortcut",
    matches: (event) => event.altKey && hasDigit(event),
    payload: (event) => {
      const digit = parseDigit(event);
      return digit ? { digit } : null;
    },
    when: (context) => !context.commandCenterOpen,
  },
  {
    id: "sidebar-shortcut-tauri-mod-digit",
    action: "sidebar.navigate.shortcut",
    matches: (event) => isMod(event) && hasDigit(event),
    payload: (event) => {
      const digit = parseDigit(event);
      return digit ? { digit } : null;
    },
    when: (context) => context.isTauri && !context.commandCenterOpen,
  },
];

export function resolveKeyboardShortcut(input: {
  event: KeyboardEvent;
  context: KeyboardShortcutContext;
}): KeyboardShortcutMatch | null {
  const { event, context } = input;
  for (const binding of SHORTCUT_BINDINGS) {
    if (!binding.matches(event)) {
      continue;
    }
    if (!binding.when(context)) {
      continue;
    }
    const payload = binding.payload?.(event) ?? null;
    return {
      action: binding.action,
      payload,
      preventDefault: binding.preventDefault ?? true,
      stopPropagation: binding.stopPropagation ?? true,
    };
  }
  return null;
}
