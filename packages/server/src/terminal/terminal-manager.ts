import { createTerminal, type TerminalSession } from "./terminal.js";

export interface TerminalManager {
  getTerminals(cwd: string): Promise<TerminalSession[]>;
  createTerminal(options: { cwd: string; name?: string }): Promise<TerminalSession>;
  getTerminal(id: string): TerminalSession | undefined;
  killTerminal(id: string): void;
  listDirectories(): string[];
  killAll(): void;
}

export function createTerminalManager(): TerminalManager {
  const terminalsByCwd = new Map<string, TerminalSession[]>();
  const terminalsById = new Map<string, TerminalSession>();
  const terminalExitUnsubscribeById = new Map<string, () => void>();

  function assertAbsolutePath(cwd: string): void {
    if (!cwd.startsWith("/")) {
      throw new Error("cwd must be absolute path");
    }
  }

  function removeSessionById(id: string, options: { kill: boolean }): void {
    const session = terminalsById.get(id);
    if (!session) {
      return;
    }

    const unsubscribeExit = terminalExitUnsubscribeById.get(id);
    if (unsubscribeExit) {
      unsubscribeExit();
      terminalExitUnsubscribeById.delete(id);
    }

    terminalsById.delete(id);

    const terminals = terminalsByCwd.get(session.cwd);
    if (terminals) {
      const index = terminals.findIndex((terminal) => terminal.id === id);
      if (index !== -1) {
        terminals.splice(index, 1);
      }
      if (terminals.length === 0) {
        terminalsByCwd.delete(session.cwd);
      }
    }

    if (options.kill) {
      session.kill();
    }
  }

  function registerSession(session: TerminalSession): TerminalSession {
    terminalsById.set(session.id, session);
    const unsubscribeExit = session.onExit(() => {
      removeSessionById(session.id, { kill: false });
    });
    terminalExitUnsubscribeById.set(session.id, unsubscribeExit);
    return session;
  }

  return {
    async getTerminals(cwd: string): Promise<TerminalSession[]> {
      assertAbsolutePath(cwd);

      let terminals = terminalsByCwd.get(cwd);
      if (!terminals || terminals.length === 0) {
        const session = registerSession(
          await createTerminal({ cwd, name: "Terminal 1" })
        );
        terminals = [session];
        terminalsByCwd.set(cwd, terminals);
      }
      return terminals;
    },

    async createTerminal(options: { cwd: string; name?: string }): Promise<TerminalSession> {
      assertAbsolutePath(options.cwd);

      const terminals = terminalsByCwd.get(options.cwd) ?? [];
      const defaultName = `Terminal ${terminals.length + 1}`;
      const session = registerSession(
        await createTerminal({
          cwd: options.cwd,
          name: options.name ?? defaultName,
        })
      );

      terminals.push(session);
      terminalsByCwd.set(options.cwd, terminals);

      return session;
    },

    getTerminal(id: string): TerminalSession | undefined {
      return terminalsById.get(id);
    },

    killTerminal(id: string): void {
      removeSessionById(id, { kill: true });
    },

    listDirectories(): string[] {
      return Array.from(terminalsByCwd.keys());
    },

    killAll(): void {
      for (const id of Array.from(terminalsById.keys())) {
        removeSessionById(id, { kill: true });
      }
    },
  };
}
