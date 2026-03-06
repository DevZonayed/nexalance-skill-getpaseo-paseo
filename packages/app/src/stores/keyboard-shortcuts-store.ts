import { create } from "zustand";
import type { SidebarShortcutWorkspaceTarget } from "@/utils/sidebar-shortcuts";

export type WorkspaceTabActionRequest =
  | {
      id: number;
      serverId: string;
      workspaceId: string;
      kind: "new" | "close-current";
    }
  | {
      id: number;
      serverId: string;
      workspaceId: string;
      kind: "navigate-index";
      index: number;
    }
  | {
      id: number;
      serverId: string;
      workspaceId: string;
      kind: "navigate-relative";
      delta: 1 | -1;
    };

interface KeyboardShortcutsState {
  commandCenterOpen: boolean;
  shortcutsDialogOpen: boolean;
  altDown: boolean;
  cmdOrCtrlDown: boolean;
  /** Sidebar-visible workspace targets (up to 9), in top-to-bottom visual order. */
  sidebarShortcutWorkspaceTargets: SidebarShortcutWorkspaceTarget[];
  /** All visible workspace targets in top-to-bottom visual order. */
  visibleWorkspaceTargets: SidebarShortcutWorkspaceTarget[];
  workspaceTabActionRequest: WorkspaceTabActionRequest | null;
  nextWorkspaceTabActionRequestId: number;

  setCommandCenterOpen: (open: boolean) => void;
  setShortcutsDialogOpen: (open: boolean) => void;
  setAltDown: (down: boolean) => void;
  setCmdOrCtrlDown: (down: boolean) => void;
  setSidebarShortcutWorkspaceTargets: (targets: SidebarShortcutWorkspaceTarget[]) => void;
  setVisibleWorkspaceTargets: (targets: SidebarShortcutWorkspaceTarget[]) => void;
  resetModifiers: () => void;

  requestWorkspaceTabAction: (input:
    | {
        serverId: string;
        workspaceId: string;
        kind: "new" | "close-current";
      }
    | {
        serverId: string;
        workspaceId: string;
        kind: "navigate-index";
        index: number;
      }
    | {
        serverId: string;
        workspaceId: string;
        kind: "navigate-relative";
        delta: 1 | -1;
      }) => void;
  clearWorkspaceTabActionRequest: (id: number) => void;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsState>(
  (set, get) => ({
    commandCenterOpen: false,
    shortcutsDialogOpen: false,
    altDown: false,
    cmdOrCtrlDown: false,
    sidebarShortcutWorkspaceTargets: [],
    visibleWorkspaceTargets: [],
    workspaceTabActionRequest: null,
    nextWorkspaceTabActionRequestId: 1,

    setCommandCenterOpen: (open) => set({ commandCenterOpen: open }),
    setShortcutsDialogOpen: (open) => set({ shortcutsDialogOpen: open }),
    setAltDown: (down) => set({ altDown: down }),
    setCmdOrCtrlDown: (down) => set({ cmdOrCtrlDown: down }),
    setSidebarShortcutWorkspaceTargets: (targets) =>
      set({ sidebarShortcutWorkspaceTargets: targets }),
    setVisibleWorkspaceTargets: (targets) => set({ visibleWorkspaceTargets: targets }),
    resetModifiers: () => set({ altDown: false, cmdOrCtrlDown: false }),

    requestWorkspaceTabAction: (input) => {
      const id = get().nextWorkspaceTabActionRequestId;
      set({
        workspaceTabActionRequest: {
          ...input,
          id,
        } as WorkspaceTabActionRequest,
        nextWorkspaceTabActionRequestId: id + 1,
      });
    },
    clearWorkspaceTabActionRequest: (id) => {
      const current = get().workspaceTabActionRequest;
      if (!current || current.id !== id) {
        return;
      }
      set({ workspaceTabActionRequest: null });
    },
  })
);
