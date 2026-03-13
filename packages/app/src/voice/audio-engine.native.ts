import {
  addExpoTwoWayAudioEventListener,
  getMicrophonePermissionsAsync,
  initialize,
  playPCMData,
  requestMicrophonePermissionsAsync,
  resumePlayback,
  stopPlayback,
  tearDown,
  toggleRecording,
} from "@boudra/expo-two-way-audio";
import {
  THINKING_TONE_REPEAT_GAP_MS,
} from "@/utils/thinking-tone";
import {
  THINKING_TONE_NATIVE_PCM_BASE64,
  THINKING_TONE_NATIVE_PCM_DURATION_MS,
} from "@/utils/thinking-tone.native-pcm";
import type {
  AudioEngine,
  AudioEngineCallbacks,
  AudioPlaybackSource,
} from "@/voice/audio-engine-types";
import { Buffer } from "buffer";

interface QueuedAudio {
  audio: AudioPlaybackSource;
  resolve: (duration: number) => void;
  reject: (error: Error) => void;
}

interface CuePcm {
  pcm16k: Uint8Array;
  durationMs: number;
}

interface StreamDebugState {
  count: number;
  totalValue: number;
  maxValue: number;
  startedAtMs: number;
  lastAtMs: number;
  maxGapMs: number;
  nextLogAtMs: number;
}

interface AudioEngineTraceOptions {
  traceLabel?: string;
}

let nextAudioEngineInstanceId = 1;

function getTraceStack(): string | undefined {
  const stack = new Error().stack;
  if (!stack) {
    return undefined;
  }
  return stack
    .split("\n")
    .slice(2, 7)
    .map((line) => line.trim())
    .join(" | ");
}

function resamplePcm16(
  pcm: Uint8Array,
  fromRate: number,
  toRate: number
): Uint8Array {
  if (fromRate === toRate) {
    return pcm;
  }

  const inputSamples = Math.floor(pcm.length / 2);
  const outputSamples = Math.floor((inputSamples * toRate) / fromRate);
  const output = new Uint8Array(outputSamples * 2);
  const ratio = fromRate / toRate;

  const readInt16 = (sampleIndex: number): number => {
    const offset = sampleIndex * 2;
    if (offset + 1 >= pcm.length) {
      return 0;
    }
    const lo = pcm[offset]!;
    const hi = pcm[offset + 1]!;
    let value = (hi << 8) | lo;
    if (value & 0x8000) {
      value -= 0x10000;
    }
    return value;
  };

  const writeInt16 = (sampleIndex: number, value: number): void => {
    const clamped = Math.max(-32768, Math.min(32767, Math.round(value)));
    const offset = sampleIndex * 2;
    output[offset] = clamped & 0xff;
    output[offset + 1] = (clamped >> 8) & 0xff;
  };

  for (let i = 0; i < outputSamples; i += 1) {
    const sourceIndex = i * ratio;
    const i0 = Math.floor(sourceIndex);
    const frac = sourceIndex - i0;
    const s0 = readInt16(i0);
    const s1 = readInt16(Math.min(inputSamples - 1, i0 + 1));
    writeInt16(i, s0 + (s1 - s0) * frac);
  }

  return output;
}

function parsePcmSampleRate(mimeType: string): number | null {
  const match = /rate=(\d+)/i.exec(mimeType);
  if (!match) {
    return null;
  }
  const rate = Number(match[1]);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function logVoiceNative(event: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log(`[VoiceNative] ${event}`, details);
    return;
  }
  console.log(`[VoiceNative] ${event}`);
}

function createStreamDebugState(nowMs: number): StreamDebugState {
  return {
    count: 0,
    totalValue: 0,
    maxValue: 0,
    startedAtMs: nowMs,
    lastAtMs: nowMs,
    maxGapMs: 0,
    nextLogAtMs: nowMs + 1000,
  };
}

export function createAudioEngine(
  callbacks: AudioEngineCallbacks,
  options?: AudioEngineTraceOptions
): AudioEngine {
  const engineId = nextAudioEngineInstanceId++;
  const traceLabel = options?.traceLabel ?? "unknown";
  const traceStack = getTraceStack();
  const refs: {
    initialized: boolean;
    captureActive: boolean;
    muted: boolean;
    queue: QueuedAudio[];
    processingQueue: boolean;
    playbackTimeout: ReturnType<typeof setTimeout> | null;
    activePlayback: {
      resolve: (duration: number) => void;
      reject: (error: Error) => void;
      settled: boolean;
    } | null;
    looping: {
      active: boolean;
      token: number;
      timeout: ReturnType<typeof setTimeout> | null;
    };
    thinkingTone: CuePcm | null;
    captureDebug: StreamDebugState | null;
    volumeDebug: StreamDebugState | null;
    destroyed: boolean;
  } = {
    initialized: false,
    captureActive: false,
    muted: false,
    queue: [],
    processingQueue: false,
    playbackTimeout: null,
    activePlayback: null,
    looping: {
      active: false,
      token: 0,
      timeout: null,
    },
    thinkingTone: null,
    captureDebug: null,
    volumeDebug: null,
    destroyed: false,
  };

  logVoiceNative("engine_created", {
    engineId,
    traceLabel,
    stack: traceStack,
  });

  function resetCaptureDebug(): void {
    refs.captureDebug = null;
  }

  function resetVolumeDebug(): void {
    refs.volumeDebug = null;
  }

  function recordCaptureChunk(byteLength: number): void {
    const nowMs = Date.now();
    const debug = refs.captureDebug ?? createStreamDebugState(nowMs);
    const gapMs = debug.count === 0 ? 0 : nowMs - debug.lastAtMs;
    debug.count += 1;
    debug.totalValue += byteLength;
    debug.maxValue = Math.max(debug.maxValue, byteLength);
    debug.maxGapMs = Math.max(debug.maxGapMs, gapMs);
    debug.lastAtMs = nowMs;

    if (nowMs >= debug.nextLogAtMs) {
      const elapsedMs = Math.max(1, nowMs - debug.startedAtMs);
      logVoiceNative("capture_summary", {
        chunks: debug.count,
        totalBytes: debug.totalValue,
        averageChunkBytes: Math.round(debug.totalValue / debug.count),
        maxChunkBytes: debug.maxValue,
        chunksPerSecond: Number(((debug.count * 1000) / elapsedMs).toFixed(1)),
        maxGapMs: debug.maxGapMs,
        muted: refs.muted,
      });
      refs.captureDebug = createStreamDebugState(nowMs);
      return;
    }

    refs.captureDebug = debug;
  }

  function recordVolumeLevel(level: number): void {
    const nowMs = Date.now();
    const debug = refs.volumeDebug ?? createStreamDebugState(nowMs);
    const gapMs = debug.count === 0 ? 0 : nowMs - debug.lastAtMs;
    debug.count += 1;
    debug.totalValue += level;
    debug.maxValue = Math.max(debug.maxValue, level);
    debug.maxGapMs = Math.max(debug.maxGapMs, gapMs);
    debug.lastAtMs = nowMs;

    if (nowMs >= debug.nextLogAtMs) {
      const elapsedMs = Math.max(1, nowMs - debug.startedAtMs);
      logVoiceNative("volume_summary", {
        samples: debug.count,
        averageLevel: Number((debug.totalValue / debug.count).toFixed(3)),
        peakLevel: Number(debug.maxValue.toFixed(3)),
        samplesPerSecond: Number(((debug.count * 1000) / elapsedMs).toFixed(1)),
        maxGapMs: debug.maxGapMs,
        muted: refs.muted,
      });
      refs.volumeDebug = createStreamDebugState(nowMs);
      return;
    }

    refs.volumeDebug = debug;
  }

  const microphoneSubscription = addExpoTwoWayAudioEventListener(
    "onMicrophoneData",
    (event) => {
      console.log("[VoiceNative] onMicrophoneData", {
        engineId,
        traceLabel,
        captureActive: refs.captureActive,
        muted: refs.muted,
        bytes: event.data.byteLength,
      });
      if (!refs.captureActive || refs.muted) {
        return;
      }
      recordCaptureChunk(event.data.byteLength);
      callbacks.onCaptureData(event.data);
    }
  );
  logVoiceNative("listener_added", {
    engineId,
    traceLabel,
    event: "onMicrophoneData",
  });

  const volumeSubscription = addExpoTwoWayAudioEventListener(
    "onInputVolumeLevelData",
    (event) => {
      console.log("[VoiceNative] onInputVolumeLevelData", {
        engineId,
        traceLabel,
        captureActive: refs.captureActive,
        muted: refs.muted,
        level: event.data,
      });
      if (!refs.captureActive) {
        return;
      }
      const level = refs.muted ? 0 : event.data;
      recordVolumeLevel(level);
      callbacks.onVolumeLevel(level);
    }
  );
  logVoiceNative("listener_added", {
    engineId,
    traceLabel,
    event: "onInputVolumeLevelData",
  });

  async function ensureInitialized(): Promise<void> {
    if (refs.initialized) {
      return;
    }
    logVoiceNative("initialize_start");
    await initialize();
    refs.initialized = true;
    logVoiceNative("initialize_complete");
  }

  async function ensureMicrophonePermission(): Promise<void> {
    let permission = await getMicrophonePermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      permission = await requestMicrophonePermissionsAsync().catch(() => null);
    }
    if (!permission?.granted) {
      throw new Error(
        "Microphone permission is required to capture audio. Please enable microphone access in system settings."
      );
    }
  }

  async function ensureThinkingTone(): Promise<CuePcm> {
    if (refs.thinkingTone) {
      return refs.thinkingTone;
    }
    const pcm16k = Buffer.from(THINKING_TONE_NATIVE_PCM_BASE64, "base64");
    const durationMs = THINKING_TONE_NATIVE_PCM_DURATION_MS;
    refs.thinkingTone = { pcm16k, durationMs };
    logVoiceNative("thinking_tone_loaded", {
      bytes: pcm16k.byteLength,
      durationMs,
    });
    return refs.thinkingTone;
  }

  function clearPlaybackTimeout(): void {
    if (refs.playbackTimeout) {
      clearTimeout(refs.playbackTimeout);
      refs.playbackTimeout = null;
    }
  }

  async function playAudio(audio: AudioPlaybackSource): Promise<number> {
    await ensureInitialized();
    resumePlayback();

    return await new Promise<number>(async (resolve, reject) => {
      refs.activePlayback = { resolve, reject, settled: false };

      try {
        const arrayBuffer = await audio.arrayBuffer();
        const pcm = new Uint8Array(arrayBuffer);
        const inputRate = parsePcmSampleRate(audio.type || "") ?? 24000;
        const pcm16k = resamplePcm16(pcm, inputRate, 16000);
        const durationSec = pcm16k.length / 2 / 16000;
        logVoiceNative("playback_start", {
          inputBytes: pcm.byteLength,
          outputBytes: pcm16k.byteLength,
          inputRate,
          durationMs: Math.round(durationSec * 1000),
          queueLength: refs.queue.length,
        });

        playPCMData(pcm16k);
        clearPlaybackTimeout();
        refs.playbackTimeout = setTimeout(() => {
          clearPlaybackTimeout();
          const active = refs.activePlayback;
          if (!active || active.settled) {
            return;
          }
          active.settled = true;
          refs.activePlayback = null;
          logVoiceNative("playback_complete", {
            durationMs: Math.round(durationSec * 1000),
          });
          resolve(durationSec);
        }, durationSec * 1000);
      } catch (error) {
        clearPlaybackTimeout();
        const active = refs.activePlayback;
        if (active && !active.settled) {
          active.settled = true;
          refs.activePlayback = null;
          logVoiceNative("playback_failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
  }

  async function processQueue(): Promise<void> {
    if (refs.processingQueue || refs.queue.length === 0) {
      return;
    }

    refs.processingQueue = true;
    logVoiceNative("queue_drain_start", {
      queueLength: refs.queue.length,
    });
    while (refs.queue.length > 0) {
      const item = refs.queue.shift()!;
      try {
        const duration = await playAudio(item.audio);
        item.resolve(duration);
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    refs.processingQueue = false;
    logVoiceNative("queue_drain_complete");
  }

  function stopLooping(): void {
    if (refs.looping.active) {
      logVoiceNative("thinking_tone_stop");
    }
    refs.looping.active = false;
    refs.looping.token += 1;
    if (refs.looping.timeout) {
      clearTimeout(refs.looping.timeout);
      refs.looping.timeout = null;
    }
    stopPlayback();
  }

  return {
    async initialize() {
      await ensureInitialized();
      await ensureThinkingTone();
    },

    async destroy() {
      if (refs.destroyed) {
        logVoiceNative("engine_destroy_skipped", {
          engineId,
          traceLabel,
        });
        return;
      }
      refs.destroyed = true;
      logVoiceNative("engine_destroy_start", {
        engineId,
        traceLabel,
      });
      stopLooping();
      this.stop();
      this.clearQueue();
      if (refs.captureActive) {
        toggleRecording(false);
        refs.captureActive = false;
      }
      clearPlaybackTimeout();
      refs.muted = false;
      resetCaptureDebug();
      resetVolumeDebug();
      callbacks.onVolumeLevel(0);
      if (refs.initialized) {
        tearDown();
        refs.initialized = false;
      }
      microphoneSubscription.remove();
      logVoiceNative("listener_removed", {
        engineId,
        traceLabel,
        event: "onMicrophoneData",
      });
      volumeSubscription.remove();
      logVoiceNative("listener_removed", {
        engineId,
        traceLabel,
        event: "onInputVolumeLevelData",
      });
      logVoiceNative("engine_destroy_complete", {
        engineId,
        traceLabel,
      });
    },

    async startCapture() {
      if (refs.captureActive) {
        return;
      }

      try {
        logVoiceNative("capture_start_requested");
        logVoiceNative("capture_trace", {
          engineId,
          traceLabel,
        });
        await ensureMicrophonePermission();
        await ensureInitialized();
        toggleRecording(true);
        refs.captureActive = true;
        resetCaptureDebug();
        resetVolumeDebug();
        logVoiceNative("capture_started");
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error(String(error));
        logVoiceNative("capture_start_failed", {
          error: wrapped.message,
        });
        callbacks.onError?.(wrapped);
        throw wrapped;
      }
    },

    async stopCapture() {
      if (refs.captureActive) {
        toggleRecording(false);
      }
      refs.captureActive = false;
      refs.muted = false;
      resetCaptureDebug();
      resetVolumeDebug();
      logVoiceNative("capture_stopped");
      logVoiceNative("capture_trace", {
        engineId,
        traceLabel,
      });
      callbacks.onVolumeLevel(0);
    },

    toggleMute() {
      refs.muted = !refs.muted;
      logVoiceNative("mute_toggled", {
        muted: refs.muted,
      });
      if (refs.muted) {
        callbacks.onVolumeLevel(0);
      }
      return refs.muted;
    },

    isMuted() {
      return refs.muted;
    },

    async play(audio: AudioPlaybackSource) {
      return await new Promise<number>((resolve, reject) => {
        refs.queue.push({ audio, resolve, reject });
        logVoiceNative("queue_enqueue", {
          queueLength: refs.queue.length,
          blobBytes: audio.size,
          mimeType: audio.type || null,
        });
        if (!refs.processingQueue) {
          void processQueue();
        }
      });
    },

    stop() {
      if (refs.activePlayback) {
        logVoiceNative("playback_stopped");
      }
      stopPlayback();
      clearPlaybackTimeout();
      const active = refs.activePlayback;
      refs.activePlayback = null;
      if (active && !active.settled) {
        active.settled = true;
        active.reject(new Error("Playback stopped"));
      }
    },

    clearQueue() {
      if (refs.queue.length > 0) {
        logVoiceNative("queue_cleared", {
          queueLength: refs.queue.length,
        });
      }
      while (refs.queue.length > 0) {
        refs.queue.shift()!.reject(new Error("Playback stopped"));
      }
      refs.processingQueue = false;
    },

    isPlaying() {
      return refs.activePlayback !== null;
    },

    playLooping(audio, gapMs) {
      if (refs.looping.active) {
        return;
      }

      refs.looping.active = true;
      const token = refs.looping.token + 1;
      refs.looping.token = token;

      void (async () => {
        try {
          await ensureInitialized();
          const cue =
            audio.byteLength > 0
              ? {
                  pcm16k: audio,
                  durationMs: (audio.byteLength / 2 / 16000) * 1000,
                }
              : await ensureThinkingTone();
          logVoiceNative("thinking_tone_start", {
            bytes: cue.pcm16k.byteLength,
            durationMs: Math.round(cue.durationMs),
            gapMs: gapMs || THINKING_TONE_REPEAT_GAP_MS,
          });

          const loop = () => {
            if (!refs.looping.active || refs.looping.token !== token) {
              return;
            }
            resumePlayback();
            playPCMData(cue.pcm16k);
            logVoiceNative("thinking_tone_tick", {
              durationMs: Math.round(cue.durationMs),
            });
            refs.looping.timeout = setTimeout(
              loop,
              cue.durationMs + (gapMs || THINKING_TONE_REPEAT_GAP_MS)
            );
          };

          loop();
        } catch (error) {
          callbacks.onError?.(
            error instanceof Error ? error : new Error(String(error))
          );
        }
      })();
    },

    stopLooping,
  };
}
