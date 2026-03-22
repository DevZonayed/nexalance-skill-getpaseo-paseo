import { describe, expect, it } from "vitest";

import {
  TerminalStreamOpcode,
  decodeTerminalResizePayload,
  decodeTerminalSnapshotPayload,
  decodeTerminalStreamFrame,
  encodeTerminalResizePayload,
  encodeTerminalSnapshotPayload,
  encodeTerminalStreamFrame,
} from "./terminal-stream-protocol.js";

describe("terminal stream protocol", () => {
  it("encodes output frames as a 1-byte opcode prefix plus payload", () => {
    const payload = new TextEncoder().encode("hello");
    const encoded = encodeTerminalStreamFrame({
      opcode: TerminalStreamOpcode.Output,
      payload,
    });

    expect(encoded[0]).toBe(TerminalStreamOpcode.Output);
    expect(Array.from(encoded.subarray(1))).toEqual(Array.from(payload));

    const decoded = decodeTerminalStreamFrame(encoded);
    expect(decoded).toEqual({
      opcode: TerminalStreamOpcode.Output,
      payload,
    });
  });

  it("round-trips resize payloads", () => {
    const payload = encodeTerminalResizePayload({
      rows: 24,
      cols: 80,
    });

    expect(decodeTerminalResizePayload(payload)).toEqual({
      rows: 24,
      cols: 80,
    });
  });

  it("round-trips snapshot payloads", () => {
    const state = {
      rows: 1,
      cols: 2,
      grid: [[{ char: "A" }, { char: "B" }]],
      scrollback: [],
      cursor: { row: 0, col: 2 },
    };

    const payload = encodeTerminalSnapshotPayload(state);
    expect(decodeTerminalSnapshotPayload(payload)).toEqual(state);
  });

  it("rejects unknown opcodes", () => {
    expect(decodeTerminalStreamFrame(new Uint8Array([0xff, 0x01]))).toBeNull();
  });
});
