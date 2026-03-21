import { create } from "zustand";
import type { SidebarShortcutWorkspaceTarget } from "@/utils/sidebar-shortcuts";

interface KeyboardShortcutsState {
  commandCenterOpen: boolean;
  projectPickerOpen: boolean;
  shortcutsDialogOpen: boolean;
  altDown: boolean;
  cmdOrCtrlDown: boolean;
  /** Sidebar-visible workspace targets (up to 9), in top-to-bottom visual order. */
  sidebarShortcutWorkspaceTargets: SidebarShortcutWorkspaceTarget[];
  /** All visible workspace targets in top-to-bottom visual order. */
  visibleWorkspaceTargets: SidebarShortcutWorkspaceTarget[];

  setCommandCenterOpen: (open: boolean) => void;
  setProjectPickerOpen: (open: boolean) => void;
  setShortcutsDialogOpen: (open: boolean) => void;
  setAltDown: (down: boolean) => void;
  setCmdOrCtrlDown: (down: boolean) => void;
  setSidebarShortcutWorkspaceTargets: (targets: SidebarShortcutWorkspaceTarget[]) => void;
  setVisibleWorkspaceTargets: (targets: SidebarShortcutWorkspaceTarget[]) => void;
  resetModifiers: () => void;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsState>((set) => ({
  commandCenterOpen: false,
  projectPickerOpen: false,
  shortcutsDialogOpen: false,
  altDown: false,
  cmdOrCtrlDown: false,
  sidebarShortcutWorkspaceTargets: [],
  visibleWorkspaceTargets: [],

  setCommandCenterOpen: (open) => set({ commandCenterOpen: open }),
  setProjectPickerOpen: (open) => set({ projectPickerOpen: open }),
  setShortcutsDialogOpen: (open) => set({ shortcutsDialogOpen: open }),
  setAltDown: (down) => set({ altDown: down }),
  setCmdOrCtrlDown: (down) => set({ cmdOrCtrlDown: down }),
  setSidebarShortcutWorkspaceTargets: (targets) =>
    set({ sidebarShortcutWorkspaceTargets: targets }),
  setVisibleWorkspaceTargets: (targets) => set({ visibleWorkspaceTargets: targets }),
  resetModifiers: () => set({ altDown: false, cmdOrCtrlDown: false }),
}));
