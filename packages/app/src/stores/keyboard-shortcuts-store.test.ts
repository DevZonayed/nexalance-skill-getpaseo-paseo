import { beforeEach, describe, expect, it } from "vitest";
import { useKeyboardShortcutsStore } from "./keyboard-shortcuts-store";

beforeEach(() => {
  useKeyboardShortcutsStore.setState({
    commandCenterOpen: false,
    shortcutsDialogOpen: false,
    altDown: false,
    cmdOrCtrlDown: false,
    sidebarShortcutWorkspaceTargets: [],
    visibleWorkspaceTargets: [],
  });
});

describe("keyboard-shortcuts-store", () => {
  it("toggles command center open state", () => {
    expect(useKeyboardShortcutsStore.getState().commandCenterOpen).toBe(false);
    useKeyboardShortcutsStore.getState().setCommandCenterOpen(true);
    expect(useKeyboardShortcutsStore.getState().commandCenterOpen).toBe(true);
  });
});
