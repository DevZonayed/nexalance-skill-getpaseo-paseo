import { describe, expect, it, vi } from "vitest";

import { TerminalOutputDeliveryQueue } from "./terminal-output-delivery-queue";

describe("terminal-output-delivery-queue", () => {
  it("retries in-flight delivery when consume is missing", () => {
    vi.useFakeTimers();
    const delivered: Array<{ sequence: number; text: string; replay: boolean }> = [];
    const queue = new TerminalOutputDeliveryQueue({
      onDeliver: (chunk) => {
        delivered.push(chunk);
      },
      deliveryTimeoutMs: 100,
    });

    queue.enqueue({ sequence: 1, text: "a", replay: false });
    queue.enqueue({ sequence: 2, text: "b", replay: false });

    expect(delivered).toEqual([{ sequence: 1, text: "a", replay: false }]);

    vi.advanceTimersByTime(100);
    expect(delivered).toEqual([
      { sequence: 1, text: "a", replay: false },
      { sequence: 1, text: "a", replay: false },
    ]);

    queue.consume({ sequence: 1 });
    expect(delivered).toEqual([
      { sequence: 1, text: "a", replay: false },
      { sequence: 1, text: "a", replay: false },
      { sequence: 2, text: "b", replay: false },
    ]);

    vi.useRealTimers();
  });

  it("delivers first chunk immediately and blocks later chunks until consumed", () => {
    const delivered: Array<{ sequence: number; text: string; replay: boolean }> = [];
    const queue = new TerminalOutputDeliveryQueue({
      onDeliver: (chunk) => {
        delivered.push(chunk);
      },
    });

    queue.enqueue({ sequence: 1, text: "a", replay: false });
    queue.enqueue({ sequence: 2, text: "b", replay: false });
    queue.enqueue({ sequence: 3, text: "c", replay: false });

    expect(delivered).toEqual([{ sequence: 1, text: "a", replay: false }]);

    queue.consume({ sequence: 1 });
    expect(delivered).toEqual([
      { sequence: 1, text: "a", replay: false },
      { sequence: 3, text: "bc", replay: false },
    ]);
  });

  it("ignores stale consume acknowledgements", () => {
    const delivered = vi.fn();
    const queue = new TerminalOutputDeliveryQueue({ onDeliver: delivered });

    queue.enqueue({ sequence: 1, text: "x", replay: false });
    queue.consume({ sequence: 99 });
    queue.enqueue({ sequence: 2, text: "y", replay: false });

    expect(delivered).toHaveBeenCalledTimes(1);
    expect(delivered).toHaveBeenNthCalledWith(1, { sequence: 1, text: "x", replay: false });

    queue.consume({ sequence: 1 });

    expect(delivered).toHaveBeenCalledTimes(2);
    expect(delivered).toHaveBeenNthCalledWith(2, { sequence: 2, text: "y", replay: false });
  });

  it("resets in-flight and pending chunks", () => {
    const delivered: Array<{ sequence: number; text: string; replay: boolean }> = [];
    const queue = new TerminalOutputDeliveryQueue({
      onDeliver: (chunk) => {
        delivered.push(chunk);
      },
    });

    queue.enqueue({ sequence: 1, text: "hello", replay: false });
    queue.enqueue({ sequence: 2, text: " world", replay: false });

    queue.reset();
    queue.enqueue({ sequence: 3, text: "next", replay: false });

    expect(delivered).toEqual([
      { sequence: 1, text: "hello", replay: false },
      { sequence: 3, text: "next", replay: false },
    ]);
  });

  it("preserves empty chunk payloads for authoritative clears", () => {
    const delivered: Array<{ sequence: number; text: string; replay: boolean }> = [];
    const queue = new TerminalOutputDeliveryQueue({
      onDeliver: (chunk) => {
        delivered.push(chunk);
      },
    });

    queue.enqueue({ sequence: 1, text: "abc", replay: false });
    queue.consume({ sequence: 1 });
    queue.enqueue({ sequence: 2, text: "", replay: false });

    expect(delivered).toEqual([
      { sequence: 1, text: "abc", replay: false },
      { sequence: 2, text: "", replay: false },
    ]);
  });

  it("treats clear chunks as a delivery barrier and drops pending stale text", () => {
    const delivered: Array<{ sequence: number; text: string; replay: boolean }> = [];
    const queue = new TerminalOutputDeliveryQueue({
      onDeliver: (chunk) => {
        delivered.push(chunk);
      },
    });

    queue.enqueue({ sequence: 1, text: "a", replay: false });
    queue.enqueue({ sequence: 2, text: "b", replay: false });
    queue.enqueue({ sequence: 3, text: "", replay: false });
    queue.enqueue({ sequence: 4, text: "c", replay: false });

    expect(delivered).toEqual([{ sequence: 1, text: "a", replay: false }]);

    queue.consume({ sequence: 1 });
    expect(delivered).toEqual([
      { sequence: 1, text: "a", replay: false },
      { sequence: 3, text: "", replay: false },
    ]);

    queue.consume({ sequence: 3 });
    expect(delivered).toEqual([
      { sequence: 1, text: "a", replay: false },
      { sequence: 3, text: "", replay: false },
      { sequence: 4, text: "c", replay: false },
    ]);
  });
});
