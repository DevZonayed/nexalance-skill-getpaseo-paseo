import { describe, expect, it, vi } from "vitest";

import { SpeechSegmenter } from "./speech-segmenter";

const mkPcmBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = i % 255;
  return bytes;
};

describe("SpeechSegmenter", () => {
  it("streams continuously and flushes at stop", () => {
    const onAudioSegment = vi.fn();
    const segmenter = new SpeechSegmenter(
      {
        enableContinuousStreaming: true,
        volumeThreshold: 0.3,
        silenceDurationMs: 2000,
        speechConfirmationMs: 300,
        detectionGracePeriodMs: 200,
        minChunkDurationMs: 100, // ensure we only flush on stop
        pcmSampleRate: 1000,
      },
      { onAudioSegment }
    );

    segmenter.pushPcmChunk(mkPcmBytes(50));
    segmenter.pushPcmChunk(mkPcmBytes(50));
    expect(onAudioSegment).not.toHaveBeenCalled();

    segmenter.stop(Date.now());

    expect(onAudioSegment).toHaveBeenCalledTimes(1);
    const lastCall = onAudioSegment.mock.calls.at(-1)![0];
    expect(lastCall.isLast).toBe(true);
    expect(lastCall.audioData.length).toBeGreaterThan(0);
  });

  it("detects speech, calls onSpeechStart, and flushes on speech end", () => {
    const onAudioSegment = vi.fn();
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();
    const detectingChanges: boolean[] = [];
    const speakingChanges: boolean[] = [];

    const segmenter = new SpeechSegmenter(
      {
        enableContinuousStreaming: false,
        volumeThreshold: 0.3,
        silenceDurationMs: 2000,
        speechConfirmationMs: 300,
        detectionGracePeriodMs: 200,
        minChunkDurationMs: 100,
        pcmSampleRate: 1000,
      },
      {
        onAudioSegment,
        onSpeechStart,
        onSpeechEnd,
        onDetectingChange: (v) => detectingChanges.push(v),
        onSpeakingChange: (v) => speakingChanges.push(v),
      }
    );

    const t0 = 10_000;

    // Start detection.
    segmenter.pushVolumeLevel(0.5, t0);
    segmenter.pushPcmChunk(mkPcmBytes(50));
    expect(detectingChanges).toEqual([true]);
    expect(speakingChanges).toEqual([true]);
    expect(onSpeechStart).not.toHaveBeenCalled();

    // Confirm speech.
    segmenter.pushVolumeLevel(0.5, t0 + 300);
    segmenter.pushPcmChunk(mkPcmBytes(50));
    expect(onSpeechStart).toHaveBeenCalledTimes(1);
    expect(detectingChanges).toEqual([true, false]);
    expect(speakingChanges).toEqual([true]);

    // End speech after silence.
    segmenter.pushVolumeLevel(0.0, t0 + 301);
    segmenter.pushPcmChunk(mkPcmBytes(50));
    segmenter.pushVolumeLevel(0.0, t0 + 301 + 2000);
    segmenter.pushVolumeLevel(0.0, t0 + 301 + 2000 + 2000);

    expect(onSpeechEnd).toHaveBeenCalledTimes(1);
    expect(detectingChanges).toEqual([true, false, true, false]);
    expect(speakingChanges).toEqual([true, false]);
    expect(onAudioSegment).toHaveBeenCalled();
    const lastCall = onAudioSegment.mock.calls.at(-1)![0];
    expect(lastCall.isLast).toBe(true);
    expect(lastCall.audioData.length).toBeGreaterThan(0);
  });

  it("keeps detection alive across a brief pause and confirms short utterances", () => {
    const onSpeechStart = vi.fn();
    const detectingChanges: boolean[] = [];

    const segmenter = new SpeechSegmenter(
      {
        enableContinuousStreaming: false,
        volumeThreshold: 0.18,
        silenceDurationMs: 1400,
        speechConfirmationMs: 120,
        detectionGracePeriodMs: 700,
        minChunkDurationMs: 100,
        pcmSampleRate: 1000,
      },
      {
        onSpeechStart,
        onDetectingChange: (v) => detectingChanges.push(v),
      }
    );

    const t0 = 20_000;

    segmenter.pushVolumeLevel(0.4, t0);
    segmenter.pushPcmChunk(mkPcmBytes(20));
    segmenter.pushVolumeLevel(0.0, t0 + 80);
    segmenter.pushPcmChunk(mkPcmBytes(20));
    segmenter.pushVolumeLevel(0.4, t0 + 140);
    segmenter.pushPcmChunk(mkPcmBytes(20));

    expect(detectingChanges).toContain(true);
    expect(onSpeechStart).toHaveBeenCalledTimes(1);
  });

  it("keeps utterance open after fade-out and resumes speaking during silence grace", () => {
    const onAudioSegment = vi.fn();
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();
    const speakingChanges: boolean[] = [];

    const segmenter = new SpeechSegmenter(
      {
        enableContinuousStreaming: false,
        volumeThreshold: 0.2,
        silenceDurationMs: 1500,
        speechConfirmationMs: 120,
        detectionGracePeriodMs: 400,
        minChunkDurationMs: 1000, // keep everything buffered until final flush
        pcmSampleRate: 1000,
      },
      {
        onAudioSegment,
        onSpeechStart,
        onSpeechEnd,
        onSpeakingChange: (v) => speakingChanges.push(v),
      }
    );

    const t0 = 30_000;

    // Start + confirm speaking.
    segmenter.pushVolumeLevel(0.6, t0);
    segmenter.pushPcmChunk(mkPcmBytes(200));
    segmenter.pushVolumeLevel(0.6, t0 + 130);
    segmenter.pushPcmChunk(mkPcmBytes(200));
    expect(onSpeechStart).toHaveBeenCalledTimes(1);

    // Drop below threshold: meter should fade, but turn remains open.
    segmenter.pushVolumeLevel(0.0, t0 + 200);
    segmenter.pushPcmChunk(mkPcmBytes(200));
    segmenter.pushVolumeLevel(0.0, t0 + 500);
    segmenter.pushPcmChunk(mkPcmBytes(200));

    // Speak again before silence timeout expires: continue same utterance.
    segmenter.pushVolumeLevel(0.6, t0 + 900);
    segmenter.pushPcmChunk(mkPcmBytes(200));
    expect(onSpeechStart).toHaveBeenCalledTimes(1);
    expect(onSpeechEnd).not.toHaveBeenCalled();

    // End for real.
    segmenter.pushVolumeLevel(0.0, t0 + 1000);
    segmenter.pushPcmChunk(mkPcmBytes(200));
    segmenter.pushVolumeLevel(0.0, t0 + 2600);
    segmenter.pushVolumeLevel(0.0, t0 + 4200);

    expect(speakingChanges).toEqual([true, false, true, false]);
    expect(onSpeechEnd).toHaveBeenCalledTimes(1);
    const finalCalls = onAudioSegment.mock.calls.filter((call) => call[0].isLast);
    expect(finalCalls).toHaveLength(1);
  });

  it("keeps confirmed speech active above release threshold even when below start threshold", () => {
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();
    const speakingChanges: boolean[] = [];

    const segmenter = new SpeechSegmenter(
      {
        enableContinuousStreaming: false,
        volumeThreshold: 0.3,
        volumeReleaseThreshold: 0.1,
        silenceDurationMs: 1200,
        speechConfirmationMs: 120,
        detectionGracePeriodMs: 200,
        minChunkDurationMs: 1000,
        pcmSampleRate: 1000,
      },
      {
        onSpeechStart,
        onSpeechEnd,
        onSpeakingChange: (v) => speakingChanges.push(v),
      }
    );

    const t0 = 40_000;

    // Confirm speech.
    segmenter.pushVolumeLevel(0.4, t0);
    segmenter.pushPcmChunk(mkPcmBytes(50));
    segmenter.pushVolumeLevel(0.4, t0 + 130);
    segmenter.pushPcmChunk(mkPcmBytes(50));
    expect(onSpeechStart).toHaveBeenCalledTimes(1);

    // Stay between start and release thresholds for longer than silence timeout:
    // should still be considered speaking.
    segmenter.pushVolumeLevel(0.15, t0 + 400);
    segmenter.pushPcmChunk(mkPcmBytes(50));
    segmenter.pushVolumeLevel(0.15, t0 + 1000);
    segmenter.pushPcmChunk(mkPcmBytes(50));
    segmenter.pushVolumeLevel(0.15, t0 + 2000);
    segmenter.pushPcmChunk(mkPcmBytes(50));

    expect(onSpeechEnd).not.toHaveBeenCalled();
    expect(speakingChanges.at(-1)).toBe(true);

    // Now actually drop below release threshold and allow silence timeout.
    segmenter.pushVolumeLevel(0.0, t0 + 2001);
    segmenter.pushPcmChunk(mkPcmBytes(50));
    segmenter.pushVolumeLevel(0.0, t0 + 3405);
    segmenter.pushVolumeLevel(0.0, t0 + 4706);

    expect(onSpeechEnd).toHaveBeenCalledTimes(1);
    expect(speakingChanges.at(-1)).toBe(false);
  });

  it("ignores brief confirmed dips below release threshold without flip-flopping speaking", () => {
    const speakingChanges: boolean[] = [];

    const segmenter = new SpeechSegmenter(
      {
        enableContinuousStreaming: false,
        volumeThreshold: 0.2,
        volumeReleaseThreshold: 0.08,
        confirmedDropGracePeriodMs: 250,
        silenceDurationMs: 1500,
        speechConfirmationMs: 120,
        detectionGracePeriodMs: 200,
        minChunkDurationMs: 1000,
        pcmSampleRate: 1000,
      },
      {
        onSpeakingChange: (v) => speakingChanges.push(v),
      }
    );

    const t0 = 50_000;
    segmenter.pushVolumeLevel(0.4, t0);
    segmenter.pushVolumeLevel(0.4, t0 + 130); // confirm speaking

    // Two short dips below release threshold; both shorter than debounce.
    segmenter.pushVolumeLevel(0.05, t0 + 300);
    segmenter.pushVolumeLevel(0.09, t0 + 500);
    segmenter.pushVolumeLevel(0.05, t0 + 620);
    segmenter.pushVolumeLevel(0.1, t0 + 760);

    expect(speakingChanges).toEqual([true]);
  });
});
