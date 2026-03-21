import type {
  AudioEngine,
  AudioEngineCallbacks,
  AudioPlaybackSource,
} from "@/voice/audio-engine-types";

interface QueuedAudio {
  audio: AudioPlaybackSource;
  resolve: (duration: number) => void;
  reject: (error: Error) => void;
}

interface AudioEngineTraceOptions {
  traceLabel?: string;
}

let nextAudioEngineInstanceId = 1;

interface BridgeStats {
  windowStartedAtMs: number;
  captureEvents: number;
  captureBytes: number;
  volumeEvents: number;
  volumeMax: number;
  playbackEvents: number;
  playbackInputBytes: number;
  playbackResampledBytes: number;
  playbackDurationMs: number;
}

function parsePcmSampleRate(mimeType: string): number | null {
  const match = /rate=(\d+)/i.exec(mimeType);
  if (!match) {
    return null;
  }
  const rate = Number(match[1]);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function resamplePcm16(pcm: Uint8Array, fromRate: number, toRate: number): Uint8Array {
  if (fromRate === toRate) {
    return pcm;
  }

  const inputSamples = Math.floor(pcm.length / 2);
  const outputSamples = Math.floor((inputSamples * toRate) / fromRate);
  const out = new Uint8Array(outputSamples * 2);
  const ratio = fromRate / toRate;

  const readInt16 = (sampleIndex: number): number => {
    const i = sampleIndex * 2;
    if (i + 1 >= pcm.length) {
      return 0;
    }
    const lo = pcm[i]!;
    const hi = pcm[i + 1]!;
    let value = (hi << 8) | lo;
    if (value & 0x8000) {
      value = value - 0x10000;
    }
    return value;
  };

  const writeInt16 = (sampleIndex: number, value: number): void => {
    const clamped = Math.max(-32768, Math.min(32767, Math.round(value)));
    const i = sampleIndex * 2;
    out[i] = clamped & 0xff;
    out[i + 1] = (clamped >> 8) & 0xff;
  };

  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    const s0 = readInt16(i0);
    const s1 = readInt16(Math.min(inputSamples - 1, i0 + 1));
    writeInt16(i, s0 + (s1 - s0) * frac);
  }

  return out;
}

export function createAudioEngine(
  callbacks: AudioEngineCallbacks,
  _options?: AudioEngineTraceOptions,
): AudioEngine {
  const native = require("@getpaseo/expo-two-way-audio");
  const instanceId = nextAudioEngineInstanceId++;
  const bridgeStats: BridgeStats = {
    windowStartedAtMs: Date.now(),
    captureEvents: 0,
    captureBytes: 0,
    volumeEvents: 0,
    volumeMax: 0,
    playbackEvents: 0,
    playbackInputBytes: 0,
    playbackResampledBytes: 0,
    playbackDurationMs: 0,
  };

  const toHexPreview = (bytes: Uint8Array, count = 12): string =>
    Array.from(bytes.slice(0, count))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join(" ");

  const maybeFlushBridgeStats = (reason: string): void => {
    const now = Date.now();
    const elapsedMs = now - bridgeStats.windowStartedAtMs;
    if (elapsedMs < 1000) {
      return;
    }
    console.log(
      `[AudioEngine.native#${instanceId}][bridge] ${reason} ` +
        `capture=${bridgeStats.captureEvents}ev/${bridgeStats.captureBytes}B ` +
        `volume=${bridgeStats.volumeEvents}ev max=${bridgeStats.volumeMax.toFixed(3)} ` +
        `play=${bridgeStats.playbackEvents}ev/${bridgeStats.playbackInputBytes}B->${bridgeStats.playbackResampledBytes}B ` +
        `playMs=${bridgeStats.playbackDurationMs.toFixed(1)} ` +
        `windowMs=${elapsedMs}`,
    );
    bridgeStats.windowStartedAtMs = now;
    bridgeStats.captureEvents = 0;
    bridgeStats.captureBytes = 0;
    bridgeStats.volumeEvents = 0;
    bridgeStats.volumeMax = 0;
    bridgeStats.playbackEvents = 0;
    bridgeStats.playbackInputBytes = 0;
    bridgeStats.playbackResampledBytes = 0;
    bridgeStats.playbackDurationMs = 0;
  };

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
    sawFirstMicChunk: boolean;
    sawFirstVolumeEvent: boolean;
    destroyed: boolean;
  } = {
    initialized: false,
    captureActive: false,
    muted: false,
    queue: [],
    processingQueue: false,
    playbackTimeout: null,
    activePlayback: null,
    sawFirstMicChunk: false,
    sawFirstVolumeEvent: false,
    destroyed: false,
  };

  const microphoneSubscription = native.addExpoTwoWayAudioEventListener(
    "onMicrophoneData",
    (event: any) => {
      if (!refs.captureActive || refs.muted) {
        return;
      }
      const pcm = event.data as Uint8Array;
      if (!refs.sawFirstMicChunk) {
        refs.sawFirstMicChunk = true;
        console.log(
          `[AudioEngine.native#${instanceId}] firstMicChunk bytes=${pcm.byteLength} head=${toHexPreview(pcm)}`,
        );
      }
      bridgeStats.captureEvents += 1;
      bridgeStats.captureBytes += pcm.byteLength;
      maybeFlushBridgeStats("capture");
      callbacks.onCaptureData(pcm);
    },
  );
  const volumeSubscription = native.addExpoTwoWayAudioEventListener(
    "onInputVolumeLevelData",
    (event: any) => {
      if (!refs.captureActive) {
        return;
      }
      const level = refs.muted ? 0 : event.data;
      bridgeStats.volumeEvents += 1;
      bridgeStats.volumeMax = Math.max(bridgeStats.volumeMax, level);
      if (!refs.sawFirstVolumeEvent) {
        refs.sawFirstVolumeEvent = true;
        console.log(
          `[AudioEngine.native#${instanceId}] firstInputVolume level=${level.toFixed(3)} muted=${refs.muted}`,
        );
      }
      maybeFlushBridgeStats("volume");
      callbacks.onVolumeLevel(level);
    },
  );

  const outputVolumeSubscription = native.addExpoTwoWayAudioEventListener(
    "onOutputVolumeLevelData",
    (event: any) => {
      console.log(`[AudioEngine.native#${instanceId}] outputVolume=${event.data}`);
    },
  );

  async function ensureInitialized(): Promise<void> {
    if (refs.initialized) {
      return;
    }
    const success = await native.initialize();
    if (!success) {
      throw new Error("expo-two-way-audio: native initialize() returned false");
    }
    console.log(`[AudioEngine.native#${instanceId}] initialized successfully`);
    refs.initialized = true;
  }

  async function ensureMicrophonePermission(): Promise<void> {
    let permission = await native.getMicrophonePermissionsAsync().catch(() => null);
    console.log(
      `[AudioEngine.native#${instanceId}] microphonePermission initial=${permission?.status ?? "unknown"} granted=${String(permission?.granted ?? false)}`,
    );
    if (!permission?.granted) {
      permission = await native.requestMicrophonePermissionsAsync().catch(() => null);
      console.log(
        `[AudioEngine.native#${instanceId}] microphonePermission requested=${permission?.status ?? "unknown"} granted=${String(permission?.granted ?? false)}`,
      );
    }
    if (!permission?.granted) {
      throw new Error(
        "Microphone permission is required to capture audio. Please enable microphone access in system settings.",
      );
    }
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

        // Native AudioEngine expects 16kHz PCM16
        const pcm16k = resamplePcm16(pcm, inputRate, 16000);
        const durationSec = pcm16k.length / 2 / 16000;
        bridgeStats.playbackEvents += 1;
        bridgeStats.playbackInputBytes += pcm.length;
        bridgeStats.playbackResampledBytes += pcm16k.length;
        bridgeStats.playbackDurationMs += durationSec * 1000;

        console.log(
          `[AudioEngine.native#${instanceId}] playPCMData: inputRate=${inputRate} inputBytes=${pcm.length} ` +
            `resampled=${pcm16k.length} durationSec=${durationSec.toFixed(3)} ` +
            `pcmHead=${toHexPreview(pcm)} resampledHead=${toHexPreview(pcm16k)}`,
        );
        maybeFlushBridgeStats("play");

        native.resumePlayback();
        native.playPCMData(pcm16k);

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

  return {
    async initialize() {
      await ensureInitialized();
    },

    async destroy() {
      if (refs.destroyed) {
        return;
      }
      refs.destroyed = true;
      this.stop();
      this.clearQueue();
      if (refs.captureActive) {
        native.toggleRecording(false);
        refs.captureActive = false;
      }
      clearPlaybackTimeout();
      refs.muted = false;
      callbacks.onVolumeLevel(0);
      if (refs.initialized) {
        native.tearDown();
        refs.initialized = false;
      }
      microphoneSubscription.remove();
      volumeSubscription.remove();
      outputVolumeSubscription.remove();
    },

    async startCapture() {
      if (refs.captureActive) {
        console.log(`[AudioEngine.native#${instanceId}] startCapture skipped: already active`);
        return;
      }

      try {
        console.log(`[AudioEngine.native#${instanceId}] startCapture begin`);
        await ensureMicrophonePermission();
        await ensureInitialized();
        refs.sawFirstMicChunk = false;
        refs.sawFirstVolumeEvent = false;
        const isRecording = native.toggleRecording(true);
        refs.captureActive = true;
        console.log(
          `[AudioEngine.native#${instanceId}] startCapture toggleRecording(true) => ${String(isRecording)}`,
        );
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error(String(error));
        callbacks.onError?.(wrapped);
        throw wrapped;
      }
    },

    async stopCapture() {
      if (refs.captureActive) {
        const isRecording = native.toggleRecording(false);
        console.log(
          `[AudioEngine.native#${instanceId}] stopCapture toggleRecording(false) => ${String(isRecording)}`,
        );
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
      native.stopPlayback();
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
  };
}
