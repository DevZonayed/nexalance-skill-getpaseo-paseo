import { describe, expect, it, vi } from "vitest";

import { TerminalOutputDeliveryQueue } from "./terminal-output-delivery-queue";

describe("terminal-output-delivery-queue", () => {
  it("retries in-flight delivery when consume is missing", () => {
    vi.useFakeTimers();
    const delivered: Array<{ sequence: number; text: string }> = [];
    const queue = new TerminalOutputDeliveryQueue({
      onDeliver: (chunk) => {
        delivered.push(chunk);
      },
      deliveryTimeoutMs: 100,
    });

    queue.enqueue({ sequence: 1, text: "a" });
    queue.enqueue({ sequence: 2, text: "b" });

    expect(delivered).toEqual([{ sequence: 1, text: "a" }]);

    vi.advanceTimersByTime(100);
    expect(delivered).toEqual([
      { sequence: 1, text: "a" },
      { sequence: 1, text: "a" },
    ]);

    queue.consume({ sequence: 1 });
    expect(delivered).toEqual([
      { sequence: 1, text: "a" },
      { sequence: 1, text: "a" },
      { sequence: 2, text: "b" },
    ]);

    vi.useRealTimers();
  });

  it("delivers first chunk immediately and blocks later chunks until consumed", () => {
    const delivered: Array<{ sequence: number; text: string }> = [];
    const queue = new TerminalOutputDeliveryQueue({
      onDeliver: (chunk) => {
        delivered.push(chunk);
      },
    });

    queue.enqueue({ sequence: 1, text: "a" });
    queue.enqueue({ sequence: 2, text: "b" });
    queue.enqueue({ sequence: 3, text: "c" });

    expect(delivered).toEqual([{ sequence: 1, text: "a" }]);

    queue.consume({ sequence: 1 });
    expect(delivered).toEqual([
      { sequence: 1, text: "a" },
      { sequence: 3, text: "bc" },
    ]);
  });

  it("ignores stale consume acknowledgements", () => {
    const delivered = vi.fn();
    const queue = new TerminalOutputDeliveryQueue({ onDeliver: delivered });

    queue.enqueue({ sequence: 1, text: "x" });
    queue.consume({ sequence: 99 });
    queue.enqueue({ sequence: 2, text: "y" });

    expect(delivered).toHaveBeenCalledTimes(1);
    expect(delivered).toHaveBeenNthCalledWith(1, { sequence: 1, text: "x" });

    queue.consume({ sequence: 1 });

    expect(delivered).toHaveBeenCalledTimes(2);
    expect(delivered).toHaveBeenNthCalledWith(2, { sequence: 2, text: "y" });
  });

  it("resets in-flight and pending chunks", () => {
    const delivered: Array<{ sequence: number; text: string }> = [];
    const queue = new TerminalOutputDeliveryQueue({
      onDeliver: (chunk) => {
        delivered.push(chunk);
      },
    });

    queue.enqueue({ sequence: 1, text: "hello" });
    queue.enqueue({ sequence: 2, text: " world" });

    queue.reset();
    queue.enqueue({ sequence: 3, text: "next" });

    expect(delivered).toEqual([
      { sequence: 1, text: "hello" },
      { sequence: 3, text: "next" },
    ]);
  });

  it("preserves empty chunk payloads for authoritative clears", () => {
    const delivered: Array<{ sequence: number; text: string }> = [];
    const queue = new TerminalOutputDeliveryQueue({
      onDeliver: (chunk) => {
        delivered.push(chunk);
      },
    });

    queue.enqueue({ sequence: 1, text: "abc" });
    queue.consume({ sequence: 1 });
    queue.enqueue({ sequence: 2, text: "" });

    expect(delivered).toEqual([
      { sequence: 1, text: "abc" },
      { sequence: 2, text: "" },
    ]);
  });

  it("treats clear chunks as a delivery barrier and drops pending stale text", () => {
    const delivered: Array<{ sequence: number; text: string }> = [];
    const queue = new TerminalOutputDeliveryQueue({
      onDeliver: (chunk) => {
        delivered.push(chunk);
      },
    });

    queue.enqueue({ sequence: 1, text: "a" });
    queue.enqueue({ sequence: 2, text: "b" });
    queue.enqueue({ sequence: 3, text: "" });
    queue.enqueue({ sequence: 4, text: "c" });

    expect(delivered).toEqual([{ sequence: 1, text: "a" }]);

    queue.consume({ sequence: 1 });
    expect(delivered).toEqual([
      { sequence: 1, text: "a" },
      { sequence: 3, text: "" },
    ]);

    queue.consume({ sequence: 3 });
    expect(delivered).toEqual([
      { sequence: 1, text: "a" },
      { sequence: 3, text: "" },
      { sequence: 4, text: "c" },
    ]);
  });
});
