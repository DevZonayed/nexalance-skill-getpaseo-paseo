import { describe, expect, it } from "vitest";
import {
  BinaryMuxChannel,
  TerminalBinaryFlags,
  TerminalBinaryMessageType,
  decodeBinaryMuxFrame,
  encodeBinaryMuxFrame,
} from "./binary-mux.js";

describe("binary mux frame codec", () => {
  it("encodes and decodes round trip", () => {
    const payload = new TextEncoder().encode("hello");
    const encoded = encodeBinaryMuxFrame({
      channel: BinaryMuxChannel.Terminal,
      messageType: TerminalBinaryMessageType.OutputUtf8,
      streamId: 42,
      offset: 1234,
      flags: TerminalBinaryFlags.Replay,
      payload,
    });

    const decoded = decodeBinaryMuxFrame(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.channel).toBe(BinaryMuxChannel.Terminal);
    expect(decoded!.messageType).toBe(TerminalBinaryMessageType.OutputUtf8);
    expect(decoded!.streamId).toBe(42);
    expect(decoded!.offset).toBe(1234);
    expect(decoded!.flags).toBe(TerminalBinaryFlags.Replay);
    expect(Array.from(decoded!.payload ?? [])).toEqual(Array.from(payload));
  });

  it("rejects malformed frame payload length", () => {
    const encoded = encodeBinaryMuxFrame({
      channel: BinaryMuxChannel.Terminal,
      messageType: TerminalBinaryMessageType.InputUtf8,
      streamId: 1,
      offset: 0,
      payload: new Uint8Array([1, 2, 3]),
    });
    const tampered = encoded.slice(0, encoded.byteLength - 1);
    expect(decodeBinaryMuxFrame(tampered)).toBeNull();
  });
});
