import { describe, expect, it } from "vitest";

import {
  getWorkspaceTerminalSession,
  releaseWorkspaceTerminalSession,
  retainWorkspaceTerminalSession,
} from "./workspace-terminal-session";

describe("workspace-terminal-session", () => {
  it("returns the same workspace session instance for the same scope", () => {
    const first = getWorkspaceTerminalSession({
      scopeKey: "workspace-a",
      maxOutputChars: 1_000,
    });
    const second = getWorkspaceTerminalSession({
      scopeKey: "workspace-a",
      maxOutputChars: 50,
    });

    expect(second).toBe(first);
  });

  it("preserves resume offsets across repeated lookups", () => {
    const first = getWorkspaceTerminalSession({
      scopeKey: "workspace-resume",
      maxOutputChars: 1_000,
    });
    first.resumeOffsets.set({
      terminalId: "term-1",
      offset: 42,
    });

    const second = getWorkspaceTerminalSession({
      scopeKey: "workspace-resume",
      maxOutputChars: 1_000,
    });

    expect(second.resumeOffsets.get({ terminalId: "term-1" })).toBe(42);
  });

  it("evicts workspace terminal session state when the workspace retain count returns to zero", () => {
    const scopeKey = "workspace-release";
    const first = getWorkspaceTerminalSession({
      scopeKey,
      maxOutputChars: 1_000,
    });
    first.resumeOffsets.set({
      terminalId: "term-1",
      offset: 128,
    });

    retainWorkspaceTerminalSession({ scopeKey });
    releaseWorkspaceTerminalSession({ scopeKey });

    const second = getWorkspaceTerminalSession({
      scopeKey,
      maxOutputChars: 1_000,
    });

    expect(second).not.toBe(first);
    expect(second.resumeOffsets.get({ terminalId: "term-1" })).toBeUndefined();
  });
});
