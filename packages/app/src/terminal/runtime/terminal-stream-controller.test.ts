import { describe, expect, it } from "vitest";

import {
  TerminalStreamController,
  type TerminalStreamControllerAttachPayload,
  type TerminalStreamControllerChunk,
  type TerminalStreamControllerClient,
  type TerminalStreamControllerStatus,
} from "./terminal-stream-controller";

type FakeStreamSubscriber = (chunk: TerminalStreamControllerChunk) => void;

class FakeTerminalStreamClient implements TerminalStreamControllerClient {
  private readonly streamSubscribers = new Map<number, Set<FakeStreamSubscriber>>();
  private readonly pendingChunksByStreamId = new Map<number, TerminalStreamControllerChunk[]>();
  public attachCalls: Array<{
    terminalId: string;
    options?: {
      resumeOffset?: number;
      rows?: number;
      cols?: number;
    };
  }> = [];
  public detachCalls: number[] = [];
  public nextAttachResponses: TerminalStreamControllerAttachPayload[] = [];

  async attachTerminalStream(
    terminalId: string,
    options?: {
      resumeOffset?: number;
      rows?: number;
      cols?: number;
    }
  ): Promise<TerminalStreamControllerAttachPayload> {
    this.attachCalls.push({ terminalId, options });
    const response = this.nextAttachResponses.shift();
    if (!response) {
      throw new Error("Missing fake attach response");
    }
    return response;
  }

  async detachTerminalStream(streamId: number): Promise<void> {
    this.detachCalls.push(streamId);
  }

  onTerminalStreamData(
    streamId: number,
    handler: (chunk: TerminalStreamControllerChunk) => void
  ): () => void {
    const pendingChunks = this.pendingChunksByStreamId.get(streamId);
    if (pendingChunks && pendingChunks.length > 0) {
      for (const chunk of pendingChunks) {
        handler(chunk);
      }
      this.pendingChunksByStreamId.delete(streamId);
    }

    const subscribers = this.streamSubscribers.get(streamId) ?? new Set();
    subscribers.add(handler);
    this.streamSubscribers.set(streamId, subscribers);
    return () => {
      const current = this.streamSubscribers.get(streamId);
      current?.delete(handler);
      if (current && current.size === 0) {
        this.streamSubscribers.delete(streamId);
      }
    };
  }

  emitChunk(input: {
    streamId: number;
    offset?: number;
    endOffset: number;
    replay?: boolean;
    data: string;
  }): void {
    const subscribers = this.streamSubscribers.get(input.streamId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    const bytes = new TextEncoder().encode(input.data);
    const chunk: TerminalStreamControllerChunk = {
      offset: input.offset ?? input.endOffset - bytes.byteLength,
      endOffset: input.endOffset,
      replay: input.replay,
      data: bytes,
    };
    for (const subscriber of subscribers) {
      subscriber(chunk);
    }
  }

  bufferChunk(input: {
    streamId: number;
    offset?: number;
    endOffset: number;
    replay?: boolean;
    data: string;
  }): void {
    const chunks = this.pendingChunksByStreamId.get(input.streamId) ?? [];
    const bytes = new TextEncoder().encode(input.data);
    chunks.push({
      offset: input.offset ?? input.endOffset - bytes.byteLength,
      endOffset: input.endOffset,
      replay: input.replay,
      data: bytes,
    });
    this.pendingChunksByStreamId.set(input.streamId, chunks);
  }
}

function createControllerHarness(input?: {
  client?: FakeTerminalStreamClient;
}): {
  client: FakeTerminalStreamClient;
  chunks: Array<{ terminalId: string; text: string }>;
  statuses: TerminalStreamControllerStatus[];
  resets: string[];
  controller: TerminalStreamController;
} {
  const client = input?.client ?? new FakeTerminalStreamClient();
  const chunks: Array<{ terminalId: string; text: string }> = [];
  const statuses: TerminalStreamControllerStatus[] = [];
  const resets: string[] = [];

  const controller = new TerminalStreamController({
    client,
    getPreferredSize: () => ({ rows: 24, cols: 80 }),
    onChunk: (chunk) => {
      chunks.push(chunk);
    },
    onStatusChange: (status) => {
      statuses.push(status);
    },
    onReset: ({ terminalId }) => {
      resets.push(terminalId);
    },
    waitForDelay: async () => {},
  });

  return {
    client,
    chunks,
    statuses,
    resets,
    controller,
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 0);
  });
  await Promise.resolve();
}

describe("terminal-stream-controller", () => {
  it("streams burst chunks in order without dropping intermediate chunks", async () => {
    const harness = createControllerHarness();
    harness.client.nextAttachResponses.push({
      streamId: 7,
      currentOffset: 0,
      reset: false,
      error: null,
    });

    harness.controller.setTerminal({ terminalId: "term-1" });
    await flushAsyncWork();

    harness.client.emitChunk({
      streamId: 7,
      endOffset: 1,
      data: "a",
    });
    harness.client.emitChunk({
      streamId: 7,
      endOffset: 2,
      data: "b",
    });
    harness.client.emitChunk({
      streamId: 7,
      endOffset: 3,
      data: "c",
    });

    expect(harness.chunks).toEqual([
      { terminalId: "term-1", text: "a" },
      { terminalId: "term-1", text: "b" },
      { terminalId: "term-1", text: "c" },
    ]);
  });

  it("retries retryable attach failures and then attaches", async () => {
    const harness = createControllerHarness();
    harness.client.nextAttachResponses.push({
      streamId: null,
      currentOffset: 0,
      reset: false,
      error: "network disconnected",
    });
    harness.client.nextAttachResponses.push({
      streamId: 9,
      currentOffset: 5,
      reset: false,
      error: null,
    });

    harness.controller.setTerminal({ terminalId: "term-1" });
    await flushAsyncWork();

    expect(harness.client.attachCalls.length).toBe(2);
    expect(harness.client.attachCalls[1]?.options).toEqual({
      rows: 24,
      cols: 80,
    });
    expect(harness.controller.getActiveStreamId()).toBe(9);
    expect(harness.statuses.at(-1)).toEqual({
      terminalId: "term-1",
      streamId: 9,
      isAttaching: false,
      error: null,
    });
  });

  it("handles stream exit by reconnecting on the same terminal", async () => {
    const harness = createControllerHarness();
    harness.client.nextAttachResponses.push({
      streamId: 3,
      currentOffset: 0,
      reset: false,
      error: null,
    });
    harness.client.nextAttachResponses.push({
      streamId: 4,
      currentOffset: 2,
      reset: false,
      error: null,
    });

    harness.controller.setTerminal({ terminalId: "term-1" });
    await flushAsyncWork();

    harness.client.emitChunk({
      streamId: 3,
      endOffset: 2,
      data: "hi",
    });
    harness.controller.handleStreamExit({
      terminalId: "term-1",
      streamId: 3,
    });
    await flushAsyncWork();

    expect(harness.client.attachCalls.length).toBe(2);
    expect(harness.client.attachCalls[1]?.options).toEqual({
      resumeOffset: 2,
      rows: 24,
      cols: 80,
    });
    expect(harness.controller.getActiveStreamId()).toBe(4);
    expect(harness.statuses.at(-1)).toEqual({
      terminalId: "term-1",
      streamId: 4,
      isAttaching: false,
      error: null,
    });
  });

  it("emits reset callback when attach indicates output reset", async () => {
    const harness = createControllerHarness();
    harness.client.nextAttachResponses.push({
      streamId: 12,
      currentOffset: 0,
      reset: true,
      error: null,
    });

    harness.controller.setTerminal({ terminalId: "term-reset" });
    await flushAsyncWork();

    expect(harness.resets).toEqual(["term-reset"]);
    expect(harness.controller.getActiveStreamId()).toBe(12);
  });

  it("delivers buffered replay chunks flushed synchronously during subscribe", async () => {
    const harness = createControllerHarness();
    harness.client.nextAttachResponses.push({
      streamId: 17,
      replayedFrom: 0,
      currentOffset: 10,
      reset: false,
      error: null,
    });
    harness.client.bufferChunk({
      streamId: 17,
      offset: 0,
      endOffset: 10,
      replay: true,
      data: "buffered-replay",
    });

    harness.controller.setTerminal({ terminalId: "term-buffered" });
    await flushAsyncWork();

    expect(harness.chunks).toEqual([
      { terminalId: "term-buffered", text: "buffered-replay" },
    ]);
  });

  it("clears stale selected output when bootstrap replay starts before current offset", async () => {
    const harness = createControllerHarness();
    harness.client.nextAttachResponses.push({
      streamId: 61,
      replayedFrom: 0,
      currentOffset: 20,
      reset: false,
      error: null,
    });

    harness.controller.setTerminal({ terminalId: "term-bootstrap-reset" });
    await flushAsyncWork();

    expect(harness.resets).toEqual(["term-bootstrap-reset"]);
  });

  it("reattaches and replays from last contiguous offset when chunk offsets gap", async () => {
    const harness = createControllerHarness();
    harness.client.nextAttachResponses.push({
      streamId: 31,
      currentOffset: 0,
      reset: false,
      error: null,
    });
    harness.client.nextAttachResponses.push({
      streamId: 32,
      currentOffset: 8,
      reset: false,
      error: null,
    });

    harness.controller.setTerminal({ terminalId: "term-gap" });
    await flushAsyncWork();

    harness.client.emitChunk({
      streamId: 31,
      offset: 0,
      endOffset: 2,
      data: "ok",
    });
    harness.client.emitChunk({
      streamId: 31,
      offset: 4,
      endOffset: 8,
      data: "miss",
    });
    await flushAsyncWork();

    expect(harness.chunks).toEqual([{ terminalId: "term-gap", text: "ok" }]);
    expect(harness.client.detachCalls).toContain(31);
    expect(harness.client.attachCalls.length).toBe(2);
    expect(harness.client.attachCalls[1]?.options).toEqual({
      resumeOffset: 2,
      rows: 24,
      cols: 80,
    });
    expect(harness.controller.getActiveStreamId()).toBe(32);
  });

  it("does not treat replay range before currentOffset as a live gap", async () => {
    const harness = createControllerHarness();
    harness.client.nextAttachResponses.push({
      streamId: 41,
      replayedFrom: 50,
      currentOffset: 100,
      reset: false,
      error: null,
    });
    harness.client.bufferChunk({
      streamId: 41,
      offset: 80,
      endOffset: 100,
      data: "replay-tail",
    });

    harness.controller.setTerminal({ terminalId: "term-replay" });
    await flushAsyncWork();

    harness.client.emitChunk({
      streamId: 41,
      offset: 100,
      endOffset: 102,
      data: "ok",
    });

    expect(harness.client.detachCalls).toEqual([]);
    expect(harness.client.attachCalls).toHaveLength(1);
    expect(harness.controller.getActiveStreamId()).toBe(41);
    expect(harness.chunks).toEqual([
      { terminalId: "term-replay", text: "replay-tail" },
      { terminalId: "term-replay", text: "ok" },
    ]);
  });

  it("accepts clamped replay start after reconnect without entering a reconnect loop", async () => {
    const harness = createControllerHarness();
    harness.client.nextAttachResponses.push({
      streamId: 71,
      replayedFrom: 205,
      currentOffset: 205,
      reset: false,
      error: null,
    });
    harness.client.nextAttachResponses.push({
      streamId: 72,
      replayedFrom: 396,
      currentOffset: 978,
      reset: true,
      error: null,
    });

    harness.controller.setTerminal({ terminalId: "term-clamped-replay" });
    await flushAsyncWork();

    harness.client.emitChunk({
      streamId: 71,
      offset: 205,
      endOffset: 299,
      data: "first",
    });
    harness.client.emitChunk({
      streamId: 71,
      offset: 396,
      endOffset: 493,
      data: "gap",
    });
    await flushAsyncWork();

    expect(harness.client.attachCalls).toHaveLength(2);
    expect(harness.client.attachCalls[1]?.options).toEqual({
      resumeOffset: 299,
      rows: 24,
      cols: 80,
    });
    expect(harness.controller.getActiveStreamId()).toBe(72);

    harness.client.emitChunk({
      streamId: 72,
      replay: true,
      offset: 396,
      endOffset: 493,
      data: "replay-1",
    });
    harness.client.emitChunk({
      streamId: 72,
      replay: true,
      offset: 493,
      endOffset: 590,
      data: "replay-2",
    });
    harness.client.emitChunk({
      streamId: 72,
      replay: true,
      offset: 687,
      endOffset: 784,
      data: "replay-3",
    });
    harness.client.emitChunk({
      streamId: 72,
      replay: false,
      offset: 978,
      endOffset: 1075,
      data: "live",
    });
    await flushAsyncWork();

    expect(harness.client.attachCalls).toHaveLength(2);
    expect(harness.client.detachCalls.filter((streamId) => streamId === 71)).toHaveLength(1);
    expect(harness.chunks.at(-1)).toEqual({
      terminalId: "term-clamped-replay",
      text: "live",
    });
  });
});
