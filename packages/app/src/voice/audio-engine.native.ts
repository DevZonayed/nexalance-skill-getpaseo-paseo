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

interface AudioEngineTraceOptions {
  traceLabel?: string;
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

export function createAudioEngine(
  callbacks: AudioEngineCallbacks,
  _options?: AudioEngineTraceOptions
): AudioEngine {
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
    destroyed: false,
  };

  const microphoneSubscription = addExpoTwoWayAudioEventListener(
    "onMicrophoneData",
    (event) => {
      if (!refs.captureActive || refs.muted) {
        return;
      }
      callbacks.onCaptureData(event.data);
    }
  );

  const volumeSubscription = addExpoTwoWayAudioEventListener(
    "onInputVolumeLevelData",
    (event) => {
      if (!refs.captureActive) {
        return;
      }
      const level = refs.muted ? 0 : event.data;
      callbacks.onVolumeLevel(level);
    }
  );

  async function ensureInitialized(): Promise<void> {
    if (refs.initialized) {
      return;
    }
    await initialize();
    refs.initialized = true;
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
          resolve(durationSec);
        }, durationSec * 1000);
      } catch (error) {
        clearPlaybackTimeout();
        const active = refs.activePlayback;
        if (active && !active.settled) {
          active.settled = true;
          refs.activePlayback = null;
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
  }

  function stopLooping(): void {
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
        return;
      }
      refs.destroyed = true;
      stopLooping();
      this.stop();
      this.clearQueue();
      if (refs.captureActive) {
        toggleRecording(false);
        refs.captureActive = false;
      }
      clearPlaybackTimeout();
      refs.muted = false;
      callbacks.onVolumeLevel(0);
      if (refs.initialized) {
        tearDown();
        refs.initialized = false;
      }
      microphoneSubscription.remove();
      volumeSubscription.remove();
    },

    async startCapture() {
      if (refs.captureActive) {
        return;
      }

      try {
        await ensureMicrophonePermission();
        await ensureInitialized();
        toggleRecording(true);
        refs.captureActive = true;
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error(String(error));
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
      callbacks.onVolumeLevel(0);
    },

    toggleMute() {
      refs.muted = !refs.muted;
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
        if (!refs.processingQueue) {
          void processQueue();
        }
      });
    },

    stop() {
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

          const loop = () => {
            if (!refs.looping.active || refs.looping.token !== token) {
              return;
            }
            resumePlayback();
            playPCMData(cue.pcm16k);
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
