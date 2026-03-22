import type { TerminalState } from "@server/shared/messages";
import {
  getTerminalAttachRetryDelayMs,
  isTerminalAttachRetryableError,
  waitForDuration,
  withPromiseTimeout,
} from "@/utils/terminal-attach";

export type TerminalStreamControllerClient = {
  subscribeTerminal: (terminalId: string) => Promise<{
    terminalId: string;
    state: TerminalState | null;
    error?: string | null;
  }>;
  unsubscribeTerminal: (terminalId: string) => void;
  sendTerminalInput: (
    terminalId: string,
    message: { type: "resize"; rows: number; cols: number },
  ) => void;
  onTerminalStreamEvent: (
    handler: (
      event:
        | { terminalId: string; type: "output"; data: Uint8Array }
        | { terminalId: string; type: "snapshot"; state: TerminalState },
    ) => void,
  ) => () => void;
};

export type TerminalStreamControllerSize = {
  rows: number;
  cols: number;
};

export type TerminalStreamControllerStatus = {
  terminalId: string | null;
  isAttaching: boolean;
  error: string | null;
};

export type TerminalStreamControllerOptions = {
  client: TerminalStreamControllerClient;
  getPreferredSize: () => TerminalStreamControllerSize | null;
  onOutput: (input: { terminalId: string; text: string }) => void;
  onSnapshot: (input: { terminalId: string; state: TerminalState }) => void;
  onStatusChange?: (status: TerminalStreamControllerStatus) => void;
  maxAttachAttempts?: number;
  attachTimeoutMs?: number;
  reconnectErrorMessage?: string;
  withTimeout?: <T>(input: {
    promise: Promise<T>;
    timeoutMs: number;
    timeoutMessage: string;
  }) => Promise<T>;
  waitForDelay?: (input: { durationMs: number }) => Promise<void>;
  isRetryableError?: (input: { message: string }) => boolean;
  getRetryDelayMs?: (input: { attempt: number }) => number;
};

const DEFAULT_ATTACH_MAX_ATTEMPTS = 4;
const DEFAULT_ATTACH_TIMEOUT_MS = 12_000;
const DEFAULT_RECONNECT_ERROR_MESSAGE = "Terminal stream ended. Reconnecting…";

export class TerminalStreamController {
  private readonly unsubscribeStreamEvents: () => void;
  private readonly decoder = new TextDecoder();
  private selectedTerminalId: string | null = null;
  private attachGeneration = 0;
  private isDisposed = false;

  constructor(private readonly options: TerminalStreamControllerOptions) {
    this.unsubscribeStreamEvents = this.options.client.onTerminalStreamEvent((event) => {
      if (this.isDisposed || event.terminalId !== this.selectedTerminalId) {
        return;
      }
      if (event.type === "snapshot") {
        this.decoder.decode();
        this.options.onSnapshot({
          terminalId: event.terminalId,
          state: event.state,
        });
        return;
      }

      const text = this.decoder.decode(event.data, { stream: true });
      if (text.length === 0) {
        return;
      }
      this.options.onOutput({
        terminalId: event.terminalId,
        text,
      });
    });
  }

  setTerminal(input: { terminalId: string | null }): void {
    if (this.isDisposed) {
      return;
    }

    const nextTerminalId = input.terminalId;
    if (this.selectedTerminalId === nextTerminalId) {
      return;
    }

    const previousTerminalId = this.selectedTerminalId;
    this.selectedTerminalId = nextTerminalId;
    this.attachGeneration += 1;
    const generation = this.attachGeneration;

    this.decoder.decode();
    if (previousTerminalId) {
      this.options.client.unsubscribeTerminal(previousTerminalId);
    }

    if (!nextTerminalId) {
      this.updateStatus({
        terminalId: null,
        isAttaching: false,
        error: null,
      });
      return;
    }

    this.updateStatus({
      terminalId: nextTerminalId,
      isAttaching: true,
      error: null,
    });
    void this.attachTerminal({
      terminalId: nextTerminalId,
      generation,
    });
  }

  handleStreamExit(input: { terminalId: string }): void {
    if (this.isDisposed || this.selectedTerminalId !== input.terminalId) {
      return;
    }

    this.attachGeneration += 1;
    const generation = this.attachGeneration;
    this.decoder.decode();
    this.updateStatus({
      terminalId: input.terminalId,
      isAttaching: true,
      error: this.options.reconnectErrorMessage ?? DEFAULT_RECONNECT_ERROR_MESSAGE,
    });
    void this.attachTerminal({
      terminalId: input.terminalId,
      generation,
    });
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.attachGeneration += 1;
    this.decoder.decode();
    const selectedTerminalId = this.selectedTerminalId;
    this.selectedTerminalId = null;
    if (selectedTerminalId) {
      this.options.client.unsubscribeTerminal(selectedTerminalId);
    }
    this.unsubscribeStreamEvents();
    this.updateStatus({
      terminalId: null,
      isAttaching: false,
      error: null,
    });
  }

  private async attachTerminal(input: { terminalId: string; generation: number }): Promise<void> {
    const {
      maxAttachAttempts = DEFAULT_ATTACH_MAX_ATTEMPTS,
      attachTimeoutMs = DEFAULT_ATTACH_TIMEOUT_MS,
      withTimeout = withPromiseTimeout,
      waitForDelay = waitForDuration,
      isRetryableError = isTerminalAttachRetryableError,
      getRetryDelayMs = getTerminalAttachRetryDelayMs,
    } = this.options;

    let lastErrorMessage = "Unable to subscribe to terminal";

    for (let attempt = 0; attempt < maxAttachAttempts; attempt += 1) {
      if (!this.isAttachGenerationCurrent(input)) {
        return;
      }

      try {
        const payload = await withTimeout({
          promise: this.options.client.subscribeTerminal(input.terminalId),
          timeoutMs: attachTimeoutMs,
          timeoutMessage: "Timed out subscribing to terminal",
        });

        if (!this.isAttachGenerationCurrent(input)) {
          this.options.client.unsubscribeTerminal(input.terminalId);
          return;
        }

        if (payload.error) {
          lastErrorMessage = payload.error;
          const hasRemainingAttempts = attempt < maxAttachAttempts - 1;
          if (hasRemainingAttempts && isRetryableError({ message: lastErrorMessage })) {
            await waitForDelay({ durationMs: getRetryDelayMs({ attempt }) });
            continue;
          }

          this.updateStatus({
            terminalId: input.terminalId,
            isAttaching: false,
            error: lastErrorMessage,
          });
          return;
        }

        const preferredSize = this.options.getPreferredSize();
        if (preferredSize) {
          this.options.client.sendTerminalInput(input.terminalId, {
            type: "resize",
            rows: preferredSize.rows,
            cols: preferredSize.cols,
          });
        }

        this.updateStatus({
          terminalId: input.terminalId,
          isAttaching: false,
          error: null,
        });
        return;
      } catch (error) {
        lastErrorMessage =
          error instanceof Error ? error.message : "Unable to subscribe to terminal";
        const hasRemainingAttempts = attempt < maxAttachAttempts - 1;
        if (hasRemainingAttempts && isRetryableError({ message: lastErrorMessage })) {
          await waitForDelay({ durationMs: getRetryDelayMs({ attempt }) });
          continue;
        }

        this.updateStatus({
          terminalId: input.terminalId,
          isAttaching: false,
          error: lastErrorMessage,
        });
        return;
      }
    }

    this.updateStatus({
      terminalId: input.terminalId,
      isAttaching: false,
      error: lastErrorMessage,
    });
  }

  private isAttachGenerationCurrent(input: { terminalId: string; generation: number }): boolean {
    if (this.isDisposed) {
      return false;
    }
    return this.attachGeneration === input.generation && this.selectedTerminalId === input.terminalId;
  }

  private updateStatus(status: TerminalStreamControllerStatus): void {
    this.options.onStatusChange?.(status);
  }
}
