import { describe, expect, it } from "vitest";

import { FixedDurationPcmRingBuffer } from "./fixed-duration-pcm-ring-buffer.js";

describe("FixedDurationPcmRingBuffer", () => {
  it("retains only the configured prefix window", () => {
    const buffer = new FixedDurationPcmRingBuffer({
      sampleRate: 1000,
      channels: 1,
      bitsPerSample: 16,
      durationMs: 100,
    });

    buffer.append(Buffer.alloc(120));
    buffer.append(Buffer.alloc(120, 1));

    const drained = buffer.drain();
    expect(drained.length).toBe(120);
    expect(Array.from(drained.slice(0, 4))).toEqual([1, 1, 1, 1]);
  });

  it("drains buffered chunks in arrival order", () => {
    const buffer = new FixedDurationPcmRingBuffer({
      sampleRate: 1000,
      channels: 1,
      bitsPerSample: 16,
      durationMs: 500,
    });

    buffer.append(Buffer.from([1, 2]));
    buffer.append(Buffer.from([3, 4]));
    buffer.append(Buffer.from([5, 6]));

    expect(Array.from(buffer.drain())).toEqual([1, 2, 3, 4, 5, 6]);
    expect(buffer.drain().length).toBe(0);
  });
});
