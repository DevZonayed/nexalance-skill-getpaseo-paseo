import { describe, expect, it } from "vitest";

import { canToggleFileExplorerShortcut } from "./keyboard-shortcut-routing";

describe("keyboard-shortcut-routing", () => {
  describe("canToggleFileExplorerShortcut", () => {
    const toggleFileExplorer = () => undefined;

    it("allows the shortcut on selected-agent routes", () => {
      const canToggle = canToggleFileExplorerShortcut({
        selectedAgentId: "server-1:agent-1",
        pathname: "/h/server-1/agent/agent-1",
        toggleFileExplorer,
      });

      expect(canToggle).toBe(true);
    });

    it("allows the shortcut on draft routes", () => {
      const canToggle = canToggleFileExplorerShortcut({
        pathname: "/h/server-1/agent",
        toggleFileExplorer,
      });

      expect(canToggle).toBe(true);
    });

    it("blocks the shortcut when no toggle handler exists", () => {
      const canToggle = canToggleFileExplorerShortcut({
        pathname: "/h/server-1/agent",
      });

      expect(canToggle).toBe(false);
    });

    it("blocks the shortcut outside agent routes", () => {
      const canToggle = canToggleFileExplorerShortcut({
        pathname: "/h/server-1/settings",
        toggleFileExplorer,
      });

      expect(canToggle).toBe(false);
    });
  });
});
