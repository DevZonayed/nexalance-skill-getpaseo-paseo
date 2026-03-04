import { describe, expect, it } from "vitest";

import {
  canToggleFileExplorerShortcut,
  resolveSelectedOrRouteAgentKey,
} from "./keyboard-shortcut-routing";

describe("keyboard-shortcut-routing", () => {
  describe("resolveSelectedOrRouteAgentKey", () => {
    it("returns selected agent key when provided", () => {
      const key = resolveSelectedOrRouteAgentKey({
        selectedAgentId: "server-1:agent-1",
        pathname: "/h/server-1/workspace/workspace-1?open=draft%3Adraft_123",
      });

      expect(key).toBe("server-1:agent-1");
    });

    it("maps workspace draft tabs to the draft tab id key", () => {
      const key = resolveSelectedOrRouteAgentKey({
        pathname: "/h/server-1/workspace/workspace-1?open=draft%3Adraft_123",
      });

      expect(key).toBe("server-1:draft_123");
    });
  });

  describe("canToggleFileExplorerShortcut", () => {
    const toggleFileExplorer = () => undefined;

    it("allows the shortcut on selected-agent routes", () => {
      const canToggle = canToggleFileExplorerShortcut({
        selectedAgentId: "server-1:agent-1",
        pathname: "/h/server-1/workspace/workspace-1?open=agent%3Aagent-1",
        toggleFileExplorer,
      });

      expect(canToggle).toBe(true);
    });

    it("allows the shortcut on workspace routes", () => {
      const canToggle = canToggleFileExplorerShortcut({
        pathname: "/h/server-1/workspace/workspace-1",
        toggleFileExplorer,
      });

      expect(canToggle).toBe(true);
    });

    it("allows the shortcut on workspace routes with intent query", () => {
      const canToggle = canToggleFileExplorerShortcut({
        pathname: "/h/server-1/workspace/workspace-1?open=terminal%3Aterminal-1",
        toggleFileExplorer,
      });

      expect(canToggle).toBe(true);
    });

    it("allows the shortcut on workspace draft-intent routes", () => {
      const canToggle = canToggleFileExplorerShortcut({
        pathname: "/h/server-1/workspace/workspace-1?open=draft%3Adraft_123",
        toggleFileExplorer,
      });

      expect(canToggle).toBe(true);
    });

    it("blocks the shortcut when no toggle handler exists", () => {
      const canToggle = canToggleFileExplorerShortcut({
        pathname: "/h/server-1/workspace/workspace-1?open=draft%3Adraft_123",
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
