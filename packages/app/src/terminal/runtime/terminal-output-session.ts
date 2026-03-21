import { TerminalOutputPump, type TerminalOutputChunk } from "./terminal-output-pump";
import {
  TerminalOutputDeliveryQueue,
  type TerminalOutputDeliveryChunk,
} from "./terminal-output-delivery-queue";

type TerminalOutputState = {
  selectedTerminalId: string | null;
  snapshotText: string;
  snapshotSequence: number;
  chunkText: string;
  chunkSequence: number;
  chunkReplay: boolean;
};

const EMPTY_STATE: TerminalOutputState = {
  selectedTerminalId: null,
  snapshotText: "",
  snapshotSequence: 0,
  chunkText: "",
  chunkSequence: 0,
  chunkReplay: false,
};

export type TerminalOutputSessionAppendInput = {
  terminalId: string;
  text: string;
  replay: boolean;
};

export type TerminalOutputSessionSetSelectedInput = {
  terminalId: string | null;
};

export type TerminalOutputSessionPruneInput = {
  terminalIds: string[];
};

export type TerminalOutputSessionConsumeInput = {
  sequence: number;
};

export type TerminalOutputSessionReadSnapshotInput = {
  terminalId: string | null;
};

export class TerminalOutputSession {
  private readonly listeners = new Set<() => void>();
  private readonly outputPump: TerminalOutputPump;
  private readonly deliveryQueue: TerminalOutputDeliveryQueue;
  private state: TerminalOutputState = EMPTY_STATE;

  constructor(input: { maxOutputChars: number }) {
    this.outputPump = new TerminalOutputPump({
      maxOutputChars: input.maxOutputChars,
      onSelectedOutputChunk: (chunk: TerminalOutputChunk) => {
        this.deliveryQueue.enqueue(chunk);
      },
    });

    this.deliveryQueue = new TerminalOutputDeliveryQueue({
      onDeliver: (chunk: TerminalOutputDeliveryChunk) => {
        const snapshotText = this.outputPump.readSnapshot({
          terminalId: this.state.selectedTerminalId,
        });
        this.state = {
          ...this.state,
          snapshotText,
          snapshotSequence: chunk.sequence,
          chunkText: chunk.text,
          chunkSequence: chunk.sequence,
          chunkReplay: chunk.replay,
        };
        this.emit();
      },
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): TerminalOutputState {
    return this.state;
  }

  setSelectedTerminal(input: TerminalOutputSessionSetSelectedInput): void {
    if (this.state.selectedTerminalId === input.terminalId) {
      return;
    }

    this.deliveryQueue.reset();
    this.outputPump.setSelectedTerminal({ terminalId: input.terminalId });
    const snapshotText = this.outputPump.readSnapshot({
      terminalId: input.terminalId,
    });
    this.state = {
      selectedTerminalId: input.terminalId,
      snapshotText,
      snapshotSequence: this.state.snapshotSequence,
      chunkText: "",
      chunkSequence: 0,
      chunkReplay: false,
    };
    this.emit();
  }

  append(input: TerminalOutputSessionAppendInput): void {
    this.outputPump.append(input);
  }

  readSnapshot(input: TerminalOutputSessionReadSnapshotInput): string {
    return this.outputPump.readSnapshot(input);
  }

  clearTerminal(input: { terminalId: string }): void {
    this.outputPump.clearTerminal(input);
    if (this.state.selectedTerminalId !== input.terminalId) {
      return;
    }

    this.deliveryQueue.reset();
    this.state = {
      ...this.state,
      snapshotText: "",
      chunkText: "",
      chunkSequence: 0,
      chunkReplay: false,
    };
    this.emit();
  }

  prune(input: TerminalOutputSessionPruneInput): void {
    this.outputPump.prune(input);
  }

  consume(input: TerminalOutputSessionConsumeInput): void {
    this.deliveryQueue.consume(input);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

const sessionsByScopeKey = new Map<string, TerminalOutputSession>();
const sessionRefCountByScopeKey = new Map<string, number>();

export function getTerminalOutputSession(input: {
  scopeKey: string;
  maxOutputChars: number;
}): TerminalOutputSession {
  const existing = sessionsByScopeKey.get(input.scopeKey);
  if (existing) {
    return existing;
  }

  const session = new TerminalOutputSession({
    maxOutputChars: input.maxOutputChars,
  });
  sessionsByScopeKey.set(input.scopeKey, session);
  return session;
}

export function retainTerminalOutputSession(input: { scopeKey: string }): void {
  const current = sessionRefCountByScopeKey.get(input.scopeKey) ?? 0;
  sessionRefCountByScopeKey.set(input.scopeKey, current + 1);
}

export function releaseTerminalOutputSession(input: { scopeKey: string }): void {
  const current = sessionRefCountByScopeKey.get(input.scopeKey) ?? 0;
  if (current <= 1) {
    sessionRefCountByScopeKey.delete(input.scopeKey);
    sessionsByScopeKey.delete(input.scopeKey);
    return;
  }

  sessionRefCountByScopeKey.set(input.scopeKey, current - 1);
}
