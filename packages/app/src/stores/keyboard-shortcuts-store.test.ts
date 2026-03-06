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
    workspaceTabActionRequest: null,
    nextWorkspaceTabActionRequestId: 1,
  });
});

describe("keyboard-shortcuts-store", () => {
  it("queues and clears workspace tab action requests", () => {
    useKeyboardShortcutsStore.getState().requestWorkspaceTabAction({
      serverId: "srv-1",
      workspaceId: "/repo/main",
      kind: "navigate-index",
      index: 3,
    });

    const request = useKeyboardShortcutsStore.getState().workspaceTabActionRequest;
    expect(request).toEqual({
      id: 1,
      serverId: "srv-1",
      workspaceId: "/repo/main",
      kind: "navigate-index",
      index: 3,
    });

    useKeyboardShortcutsStore.getState().clearWorkspaceTabActionRequest(999);
    expect(useKeyboardShortcutsStore.getState().workspaceTabActionRequest).not.toBeNull();

    useKeyboardShortcutsStore.getState().clearWorkspaceTabActionRequest(1);
    expect(useKeyboardShortcutsStore.getState().workspaceTabActionRequest).toBeNull();
  });
});
