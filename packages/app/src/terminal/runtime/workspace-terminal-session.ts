import {
  getTerminalOutputSession,
  releaseTerminalOutputSession,
  retainTerminalOutputSession,
  type TerminalOutputSession,
} from "./terminal-output-session";

export type WorkspaceTerminalResumeOffsets = {
  get: (input: { terminalId: string }) => number | undefined;
  set: (input: { terminalId: string; offset: number }) => void;
  clear: (input: { terminalId: string }) => void;
  prune: (input: { terminalIds: string[] }) => void;
};

export type WorkspaceTerminalSession = {
  scopeKey: string;
  outputSession: TerminalOutputSession;
  resumeOffsets: WorkspaceTerminalResumeOffsets;
};

type WorkspaceTerminalSessionRecord = {
  resumeOffsetByTerminalId: Map<string, number>;
  session: WorkspaceTerminalSession;
};

const sessionsByScopeKey = new Map<string, WorkspaceTerminalSessionRecord>();
const refCountByScopeKey = new Map<string, number>();

function createResumeOffsets(input: {
  resumeOffsetByTerminalId: Map<string, number>;
}): WorkspaceTerminalResumeOffsets {
  return {
    get: ({ terminalId }) => {
      const offset = input.resumeOffsetByTerminalId.get(terminalId);
      if (typeof offset !== "number" || !Number.isFinite(offset)) {
        return undefined;
      }
      return Math.max(0, Math.floor(offset));
    },
    set: ({ terminalId, offset }) => {
      if (!Number.isFinite(offset)) {
        return;
      }
      input.resumeOffsetByTerminalId.set(terminalId, Math.max(0, Math.floor(offset)));
    },
    clear: ({ terminalId }) => {
      input.resumeOffsetByTerminalId.delete(terminalId);
    },
    prune: ({ terminalIds }) => {
      const terminalIdSet = new Set(terminalIds);
      for (const terminalId of Array.from(input.resumeOffsetByTerminalId.keys())) {
        if (!terminalIdSet.has(terminalId)) {
          input.resumeOffsetByTerminalId.delete(terminalId);
        }
      }
    },
  };
}

export function getWorkspaceTerminalSession(input: {
  scopeKey: string;
  maxOutputChars: number;
}): WorkspaceTerminalSession {
  const existing = sessionsByScopeKey.get(input.scopeKey);
  if (existing) {
    return existing.session;
  }

  const resumeOffsetByTerminalId = new Map<string, number>();
  const session: WorkspaceTerminalSession = {
    scopeKey: input.scopeKey,
    outputSession: getTerminalOutputSession({
      scopeKey: input.scopeKey,
      maxOutputChars: input.maxOutputChars,
    }),
    resumeOffsets: createResumeOffsets({
      resumeOffsetByTerminalId,
    }),
  };

  sessionsByScopeKey.set(input.scopeKey, {
    resumeOffsetByTerminalId,
    session,
  });
  return session;
}

export function retainWorkspaceTerminalSession(input: { scopeKey: string }): void {
  const current = refCountByScopeKey.get(input.scopeKey) ?? 0;
  refCountByScopeKey.set(input.scopeKey, current + 1);
  retainTerminalOutputSession(input);
}

export function releaseWorkspaceTerminalSession(input: { scopeKey: string }): void {
  releaseTerminalOutputSession(input);
  const current = refCountByScopeKey.get(input.scopeKey) ?? 0;
  if (current > 1) {
    refCountByScopeKey.set(input.scopeKey, current - 1);
    return;
  }
  refCountByScopeKey.delete(input.scopeKey);
  sessionsByScopeKey.delete(input.scopeKey);
}
