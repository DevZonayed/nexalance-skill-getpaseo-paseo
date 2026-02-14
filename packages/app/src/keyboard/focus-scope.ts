import type { KeyboardFocusScope } from "@/keyboard/actions";

export function resolveKeyboardFocusScope(input: {
  target: EventTarget | null;
  commandCenterOpen: boolean;
}): KeyboardFocusScope {
  const { target, commandCenterOpen } = input;
  if (!(target instanceof Element)) {
    return commandCenterOpen ? "command-center" : "other";
  }

  if (
    target.closest("[data-testid='terminal-surface']") ||
    target.closest(".xterm")
  ) {
    return "terminal";
  }

  if (
    commandCenterOpen &&
    (target.closest("[data-testid='command-center-panel']") ||
      target.closest("[data-testid='command-center-input']"))
  ) {
    return "command-center";
  }

  if (target.closest("[data-testid='message-input-root']")) {
    return "message-input";
  }

  const editable = target as HTMLElement;
  if (editable.isContentEditable) {
    return commandCenterOpen ? "command-center" : "editable";
  }

  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return commandCenterOpen ? "command-center" : "editable";
  }

  return commandCenterOpen ? "command-center" : "other";
}
