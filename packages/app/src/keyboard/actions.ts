export type KeyboardFocusScope =
  | "terminal"
  | "message-input"
  | "command-center"
  | "editable"
  | "other";

export type MessageInputKeyboardActionKind =
  | "focus"
  | "dictation-toggle"
  | "dictation-cancel"
  | "voice-toggle"
  | "voice-mute-toggle";

export type KeyboardActionId =
  | "agent.new"
  | "workspace.tab.new"
  | "workspace.tab.close.current"
  | "workspace.tab.navigate.index"
  | "workspace.tab.navigate.relative"
  | "workspace.navigate.index"
  | "workspace.navigate.relative"
  | "sidebar.toggle.left"
  | "sidebar.toggle.right"
  | "command-center.toggle"
  | "shortcuts.dialog.toggle"
  | "message-input.action";

export type KeyboardShortcutPayload =
  | { index: number }
  | { delta: 1 | -1 }
  | { kind: MessageInputKeyboardActionKind }
  | null;
