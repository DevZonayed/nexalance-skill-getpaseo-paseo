import { describe, expect, it } from "vitest";

import {
  getTerminalOutputSession,
  releaseTerminalOutputSession,
  retainTerminalOutputSession,
} from "./terminal-output-session";

describe("terminal-output-session", () => {
  async function flushAsyncWork(): Promise<void> {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 0);
    });
    await Promise.resolve();
  }

  it("returns the same session instance for the same scope key", () => {
    const a = getTerminalOutputSession({
      scopeKey: "scope-a",
      maxOutputChars: 1_000,
    });
    const b = getTerminalOutputSession({
      scopeKey: "scope-a",
      maxOutputChars: 50,
    });

    expect(a).toBe(b);
  });

  it("evicts a scope session when the retain count returns to zero", () => {
    const scopeKey = "scope-retain-release";
    const first = getTerminalOutputSession({
      scopeKey,
      maxOutputChars: 1_000,
    });

    retainTerminalOutputSession({ scopeKey });
    releaseTerminalOutputSession({ scopeKey });

    const second = getTerminalOutputSession({
      scopeKey,
      maxOutputChars: 1_000,
    });

    expect(second).not.toBe(first);
  });

  it("publishes selected terminal snapshot and chunk state via delivery/consume", async () => {
    const session = getTerminalOutputSession({
      scopeKey: "scope-session-state",
      maxOutputChars: 1_000,
    });

    session.setSelectedTerminal({ terminalId: null });
    session.setSelectedTerminal({ terminalId: "term-1" });

    session.append({
      terminalId: "term-1",
      text: "abc",
      replay: false,
    });
    await flushAsyncWork();

    const stateAfterAppend = session.getState();
    expect(stateAfterAppend.selectedTerminalId).toBe("term-1");
    expect(stateAfterAppend.chunkSequence).toBeGreaterThan(0);
    expect(stateAfterAppend.chunkText).toBe("abc");
    expect(stateAfterAppend.snapshotText).toBe("abc");
    expect(stateAfterAppend.snapshotSequence).toBe(stateAfterAppend.chunkSequence);

    session.consume({ sequence: stateAfterAppend.chunkSequence });

    const stateAfterConsume = session.getState();
    expect(stateAfterConsume.snapshotText).toBe("abc");
  });

  it("keeps chunks for non-selected terminals out of selected state", async () => {
    const session = getTerminalOutputSession({
      scopeKey: "scope-other-terminal",
      maxOutputChars: 1_000,
    });

    session.setSelectedTerminal({ terminalId: "term-1" });
    session.append({
      terminalId: "term-2",
      text: "hidden",
      replay: false,
    });
    await flushAsyncWork();

    const state = session.getState();
    expect(state.selectedTerminalId).toBe("term-1");
    expect(state.chunkText).toBe("");
    expect(state.snapshotText).toBe("");
  });
});
