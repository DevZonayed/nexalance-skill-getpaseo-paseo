const MUX_MAGIC_1 = 0x50; // 'P'
const MUX_MAGIC_2 = 0x58; // 'X'
const MUX_VERSION = 1;
const HEADER_SIZE = 24;
const UINT32_MAX = 0xffffffff;
const TWO_POW_32 = 0x1_0000_0000;

export const BinaryMuxConstants = {
  magic1: MUX_MAGIC_1,
  magic2: MUX_MAGIC_2,
  version: MUX_VERSION,
  headerSize: HEADER_SIZE,
} as const;

export const enum BinaryMuxChannel {
  Terminal = 1,
  FileTransfer = 2,
}

export const enum TerminalBinaryMessageType {
  InputUtf8 = 1,
  OutputUtf8 = 2,
  Ack = 3,
}

export const enum TerminalBinaryFlags {
  Replay = 1,
}

export interface BinaryMuxFrame {
  channel: number;
  messageType: number;
  streamId: number;
  offset: number;
  flags?: number;
  payload?: Uint8Array;
}

export function asUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

export function isLikelyBinaryMuxFrame(data: Uint8Array): boolean {
  if (data.byteLength < HEADER_SIZE) {
    return false;
  }
  return data[0] === MUX_MAGIC_1 && data[1] === MUX_MAGIC_2 && data[2] === MUX_VERSION;
}

export function encodeBinaryMuxFrame(frame: BinaryMuxFrame): Uint8Array {
  const payload = frame.payload ?? new Uint8Array(0);
  const out = new Uint8Array(HEADER_SIZE + payload.byteLength);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const flags = frame.flags ?? 0;

  if (!Number.isFinite(frame.streamId) || frame.streamId < 0 || frame.streamId > UINT32_MAX) {
    throw new Error(`Invalid streamId: ${frame.streamId}`);
  }
  if (!Number.isFinite(frame.offset) || frame.offset < 0) {
    throw new Error(`Invalid offset: ${frame.offset}`);
  }

  const offsetHi = Math.floor(frame.offset / TWO_POW_32);
  const offsetLo = frame.offset >>> 0;
  if (offsetHi > UINT32_MAX) {
    throw new Error(`Offset too large: ${frame.offset}`);
  }

  view.setUint8(0, MUX_MAGIC_1);
  view.setUint8(1, MUX_MAGIC_2);
  view.setUint8(2, MUX_VERSION);
  view.setUint8(3, frame.channel & 0xff);
  view.setUint8(4, frame.messageType & 0xff);
  view.setUint8(5, flags & 0xff);
  view.setUint8(6, 0);
  view.setUint8(7, 0);
  view.setUint32(8, frame.streamId >>> 0);
  view.setUint32(12, offsetHi >>> 0);
  view.setUint32(16, offsetLo);
  view.setUint32(20, payload.byteLength >>> 0);

  out.set(payload, HEADER_SIZE);
  return out;
}

export function decodeBinaryMuxFrame(data: Uint8Array): BinaryMuxFrame | null {
  if (!isLikelyBinaryMuxFrame(data)) {
    return null;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const payloadLength = view.getUint32(20);
  if (payloadLength !== data.byteLength - HEADER_SIZE) {
    return null;
  }

  const offsetHi = view.getUint32(12);
  const offsetLo = view.getUint32(16);
  const offset = offsetHi * TWO_POW_32 + offsetLo;

  return {
    channel: view.getUint8(3),
    messageType: view.getUint8(4),
    flags: view.getUint8(5),
    streamId: view.getUint32(8),
    offset,
    payload: data.subarray(HEADER_SIZE),
  };
}
