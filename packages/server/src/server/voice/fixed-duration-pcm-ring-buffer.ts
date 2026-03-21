export class FixedDurationPcmRingBuffer {
  private readonly maxBytes: number;
  private chunks: Buffer[] = [];
  private totalBytes = 0;

  constructor(params: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    durationMs: number;
  }) {
    const bytesPerSecond = params.sampleRate * params.channels * (params.bitsPerSample / 8);
    this.maxBytes = Math.max(1, Math.round((bytesPerSecond * params.durationMs) / 1000));
  }

  append(chunk: Buffer): void {
    if (chunk.length === 0) {
      return;
    }

    this.chunks.push(chunk);
    this.totalBytes += chunk.length;

    while (this.totalBytes > this.maxBytes && this.chunks.length > 0) {
      const removed = this.chunks.shift();
      if (!removed) {
        break;
      }
      this.totalBytes -= removed.length;
    }
  }

  drain(): Buffer {
    const combined = Buffer.concat(this.chunks);
    this.clear();
    return combined;
  }

  get byteLength(): number {
    return this.totalBytes;
  }

  clear(): void {
    this.chunks = [];
    this.totalBytes = 0;
  }
}
