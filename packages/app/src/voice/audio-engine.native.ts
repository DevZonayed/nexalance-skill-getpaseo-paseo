import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import {
  THINKING_TONE_REPEAT_GAP_MS,
} from "@/utils/thinking-tone";
import {
  THINKING_TONE_NATIVE_PCM_DURATION_MS,
} from "@/utils/thinking-tone.native-pcm";
import type {
  AudioEngine,
  AudioEngineCallbacks,
  AudioPlaybackSource,
} from "@/voice/audio-engine-types";

// Use expo-av for playback instead of expo-two-way-audio (temporary test)
const USE_EXPO_AV_PLAYBACK = true;

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
    mockVolumeInterval: ReturnType<typeof setInterval> | null;
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
    mockVolumeInterval: null,
  };

  // Only subscribe to native events if not mocking
  let microphoneSubscription: { remove(): void };
  let volumeSubscription: { remove(): void };

  if (MOCK_MODE) {
    microphoneSubscription = { remove() {} };
    volumeSubscription = { remove() {} };
  } else {
    const native = require("@boudra/expo-two-way-audio");
    microphoneSubscription = native.addExpoTwoWayAudioEventListener(
      "onMicrophoneData",
      (event: any) => {
        if (!refs.captureActive || refs.muted) {
          return;
        }
        callbacks.onCaptureData(event.data);
      }
    );
    volumeSubscription = native.addExpoTwoWayAudioEventListener(
      "onInputVolumeLevelData",
      (event: any) => {
        if (!refs.captureActive) {
          return;
        }
        const level = refs.muted ? 0 : event.data;
        callbacks.onVolumeLevel(level);
      }
    );
  }

  async function ensureInitialized(): Promise<void> {
    if (refs.initialized) {
      return;
    }
    if (!MOCK_MODE) {
      const native = require("@boudra/expo-two-way-audio");
      await native.initialize();
    }
    refs.initialized = true;
  }

  async function ensureMicrophonePermission(): Promise<void> {
    if (MOCK_MODE) {
      return;
    }
    const native = require("@boudra/expo-two-way-audio");
    let permission = await native.getMicrophonePermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      permission = await native.requestMicrophonePermissionsAsync().catch(() => null);
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
    const durationMs = THINKING_TONE_NATIVE_PCM_DURATION_MS;
    refs.thinkingTone = { pcm16k: new Uint8Array(0), durationMs };
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

    return await new Promise<number>(async (resolve, reject) => {
      refs.activePlayback = { resolve, reject, settled: false };

      try {
        const arrayBuffer = await audio.arrayBuffer();
        const pcm = new Uint8Array(arrayBuffer);
        const inputRate = parsePcmSampleRate(audio.type || "") ?? 24000;
        const durationSec = pcm.length / 2 / inputRate;

        console.log(`[AudioEngine.native] playPCMData: MOCK_MODE=${MOCK_MODE} inputRate=${inputRate} inputBytes=${pcm.length} durationSec=${durationSec.toFixed(3)}`);

        if (!MOCK_MODE) {
          const native = require("@boudra/expo-two-way-audio");
          native.resumePlayback();
          native.playPCMData(pcm);
        }

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

  function nativeStopPlayback(): void {
    if (!MOCK_MODE) {
      const native = require("@boudra/expo-two-way-audio");
      native.stopPlayback();
    }
  }

  function stopLooping(): void {
    refs.looping.active = false;
    refs.looping.token += 1;
    if (refs.looping.timeout) {
      clearTimeout(refs.looping.timeout);
      refs.looping.timeout = null;
    }
    nativeStopPlayback();
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
        if (!MOCK_MODE) {
          const native = require("@boudra/expo-two-way-audio");
          native.toggleRecording(false);
        }
        if (refs.mockVolumeInterval) {
          clearInterval(refs.mockVolumeInterval);
          refs.mockVolumeInterval = null;
        }
        refs.captureActive = false;
      }
      clearPlaybackTimeout();
      refs.muted = false;
      callbacks.onVolumeLevel(0);
      if (refs.initialized && !MOCK_MODE) {
        const native = require("@boudra/expo-two-way-audio");
        native.tearDown();
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

        if (MOCK_MODE) {
          // Emit fake volume levels and empty PCM data periodically
          refs.mockVolumeInterval = setInterval(() => {
            if (!refs.captureActive) {
              return;
            }
            const fakeVolume = refs.muted ? 0 : 0.15 + Math.random() * 0.5;
            callbacks.onVolumeLevel(fakeVolume);
            // Send empty PCM chunk to keep the pipeline alive
            callbacks.onCaptureData(new Uint8Array(3200));
          }, 100);
        } else {
          const native = require("@boudra/expo-two-way-audio");
          native.toggleRecording(true);
        }
        refs.captureActive = true;
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error(String(error));
        callbacks.onError?.(wrapped);
        throw wrapped;
      }
    },

    async stopCapture() {
      if (refs.captureActive) {
        if (MOCK_MODE) {
          if (refs.mockVolumeInterval) {
            clearInterval(refs.mockVolumeInterval);
            refs.mockVolumeInterval = null;
          }
        } else {
          const native = require("@boudra/expo-two-way-audio");
          native.toggleRecording(false);
        }
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
      nativeStopPlayback();
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
          const cue = await ensureThinkingTone();

          const loop = () => {
            if (!refs.looping.active || refs.looping.token !== token) {
              return;
            }
            if (!MOCK_MODE) {
              const native = require("@boudra/expo-two-way-audio");
              native.resumePlayback();
              native.playPCMData(cue.pcm16k);
            }
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
