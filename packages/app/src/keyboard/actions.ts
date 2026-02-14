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
  | "sidebar.toggle.left"
  | "sidebar.toggle.right"
  | "sidebar.navigate.shortcut"
  | "command-center.toggle"
  | "shortcuts.dialog.toggle"
  | "message-input.action";

export type KeyboardShortcutPayload =
  | { digit: number }
  | { kind: MessageInputKeyboardActionKind }
  | null;
