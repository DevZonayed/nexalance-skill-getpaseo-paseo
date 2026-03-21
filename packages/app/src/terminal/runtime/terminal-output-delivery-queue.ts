export type TerminalOutputDeliveryChunk = {
  sequence: number;
  text: string;
  replay: boolean;
};

export type TerminalOutputDeliveryQueueOptions = {
  onDeliver: (chunk: TerminalOutputDeliveryChunk) => void;
  deliveryTimeoutMs?: number;
};

const DEFAULT_DELIVERY_TIMEOUT_MS = 8_000;

export class TerminalOutputDeliveryQueue {
  private readonly pendingChunks: TerminalOutputDeliveryChunk[] = [];
  private inFlightChunk: TerminalOutputDeliveryChunk | null = null;
  private inFlightTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastSeenSequence = 0;
  private readonly deliveryTimeoutMs: number;

  constructor(private readonly options: TerminalOutputDeliveryQueueOptions) {
    this.deliveryTimeoutMs = options.deliveryTimeoutMs ?? DEFAULT_DELIVERY_TIMEOUT_MS;
  }

  enqueue(chunk: TerminalOutputDeliveryChunk): void {
    if (chunk.sequence <= 0) {
      return;
    }
    if (chunk.sequence <= this.lastSeenSequence) {
      return;
    }
    this.lastSeenSequence = chunk.sequence;

    if (chunk.text.length === 0) {
      this.pendingChunks.length = 0;
      this.pendingChunks.push(chunk);
      this.tryDeliver();
      return;
    }

    const lastPendingChunk = this.pendingChunks[this.pendingChunks.length - 1];
    if (
      lastPendingChunk &&
      lastPendingChunk.text.length > 0 &&
      lastPendingChunk.replay === chunk.replay
    ) {
      lastPendingChunk.sequence = chunk.sequence;
      lastPendingChunk.text += chunk.text;
    } else {
      this.pendingChunks.push(chunk);
    }
    this.tryDeliver();
  }

  consume(input: { sequence: number }): void {
    if (this.inFlightChunk?.sequence !== input.sequence) {
      return;
    }

    this.clearInFlightTimeout();
    this.inFlightChunk = null;
    this.tryDeliver();
  }

  reset(): void {
    this.clearInFlightTimeout();
    this.pendingChunks.length = 0;
    this.inFlightChunk = null;
    this.lastSeenSequence = 0;
  }

  private tryDeliver(): void {
    if (this.inFlightChunk) {
      return;
    }
    const nextChunk = this.pendingChunks.shift();
    if (!nextChunk) {
      return;
    }

    this.inFlightChunk = nextChunk;
    this.deliverInFlightChunk();
  }

  private deliverInFlightChunk(): void {
    const chunk = this.inFlightChunk;
    if (!chunk) {
      return;
    }

    this.clearInFlightTimeout();
    this.inFlightTimeout = setTimeout(() => {
      if (!this.inFlightChunk) {
        return;
      }
      this.deliverInFlightChunk();
    }, this.deliveryTimeoutMs);

    this.options.onDeliver({
      sequence: chunk.sequence,
      text: chunk.text,
      replay: chunk.replay,
    });
  }

  private clearInFlightTimeout(): void {
    if (!this.inFlightTimeout) {
      return;
    }
    clearTimeout(this.inFlightTimeout);
    this.inFlightTimeout = null;
  }
}
