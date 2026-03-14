# Local Voice Turn Detection Plan

## Goal

For local realtime voice, the client should stream PCM continuously to the server. The server should own turn detection using bundled Sherpa + Silero VAD. Client-side logic stays only for meter/activation visuals and is not authoritative for turn boundaries.

The server should start buffering immediately so we do not clip the beginning of speech.

## Scope

This plan is intentionally local-only for now.

- Turn detection: local only
- STT: local only
- TTS: unchanged
- Client VAD: removed as an authority, retained only as UI metering/activation

## Design Summary

### Boundaries

- Client
  - Captures PCM
  - Streams fixed-size chunks continuously during voice mode
  - Shows volume meter / activation visuals
  - Does not decide turn start or turn end
- Server turn detection
  - Consumes live PCM stream
  - Runs local Silero VAD through Sherpa
  - Emits normalized events:
    - `speech_started`
    - `speech_stopped`
- Server voice turn controller
  - Owns barge-in
  - Owns rolling pre-speech buffer
  - Owns utterance lifecycle
  - Feeds utterance audio into the existing STT path
- Server STT
  - Transcribes utterance audio selected by turn detection

## Core Principle

Do not hide VAD inside STT.

If STT owns VAD, the abstraction gets coupled again. Turn detection and transcription are different responsibilities and should be modeled separately.

Bad shape:

```ts
interface SpeechToTextProvider {
  createSession(): {
    appendPcm16(chunk: Buffer): void;
    commit(): void;
    on(event: "speech_started" | "speech_stopped" | "transcript", handler: unknown): unknown;
  };
}
```

Better shape:

```ts
interface TurnDetectionProvider {
  createSession(input: {
    logger: pino.Logger;
  }): TurnDetectionSession;
}

interface TurnDetectionSession {
  requiredSampleRate: number;
  connect(): Promise<void>;
  appendPcm16(chunk: Buffer): void;
  close(): void;

  on(event: "speech_started", handler: () => void): unknown;
  on(event: "speech_stopped", handler: () => void): unknown;
  on(event: "error", handler: (err: unknown) => void): unknown;
}
```

And keep STT separate:

```ts
interface SpeechToTextProvider {
  id: "local" | "openai" | (string & {});
  createSession(input: {
    logger: pino.Logger;
    language?: string;
    prompt?: string;
  }): StreamingTranscriptionSession;
}
```

## Config Shape

Even in a local-only rollout, the boundary should be explicit now so it does not need a second refactor later.

Current shape:

```ts
type RequestedSpeechProviders = {
  dictationStt: RequestedSpeechProvider;
  voiceStt: RequestedSpeechProvider;
  voiceTts: RequestedSpeechProvider;
};
```

Proposed shape:

```ts
type RequestedSpeechProviders = {
  dictationStt: RequestedSpeechProvider;
  voiceTurnDetection: RequestedSpeechProvider;
  voiceStt: RequestedSpeechProvider;
  voiceTts: RequestedSpeechProvider;
};
```

For the first implementation, resolution can still force local:

```ts
const providers = {
  dictationStt: { provider: "local", explicit: false, enabled: true },
  voiceTurnDetection: { provider: "local", explicit: false, enabled: true },
  voiceStt: { provider: "local", explicit: false, enabled: true },
  voiceTts: { provider: "local", explicit: false, enabled: true },
};
```

## Runtime Shape

### 1. Local Turn Detection Provider

Add a local provider parallel to local STT/TTS runtime wiring.

Suggested files:

- `packages/server/src/server/speech/turn-detection-provider.ts`
- `packages/server/src/server/speech/providers/local/sherpa/silero-vad-session.ts`
- `packages/server/src/server/speech/providers/local/sherpa/silero-vad-provider.ts`

Expanded local runtime output:

```ts
interface InitializedLocalSpeech {
  sttService: SpeechToTextProvider | null;
  ttsService: TextToSpeechProvider | null;
  dictationSttService: SpeechToTextProvider | null;
  turnDetectionService: TurnDetectionProvider | null;
  cleanup: () => void;
}
```

Provider construction in local runtime:

```ts
if (
  providers.voiceTurnDetection.enabled !== false &&
  providers.voiceTurnDetection.provider === "local"
) {
  turnDetectionService = new SherpaSileroTurnDetectionProvider(
    {
      modelPath: bundledSileroModelPath,
      sampleRate: 16000,
    },
    logger
  );
}
```

### 2. Voice Turn Controller

This should sit in the server session layer and own the utterance state machine.

Suggested file:

- `packages/server/src/server/voice/voice-turn-controller.ts`

Responsibilities:

- receive continuous PCM chunks
- write chunks into a rolling pre-speech buffer
- feed chunks into detector
- on `speech_started`
  - perform barge-in
  - start a new utterance
  - flush pre-speech buffer into utterance
- while speech is active
  - append live chunks into utterance
- on `speech_stopped`
  - finalize utterance into STT

Public shape:

```ts
interface VoiceTurnController {
  start(): Promise<void>;
  stop(): Promise<void>;
  appendClientChunk(input: {
    audioBase64: string;
    format: string;
  }): Promise<void>;
}
```

Internal state should be explicit:

```ts
type VoiceInputState =
  | { status: "idle" }
  | {
      status: "listening";
      rollingPrefixBytes: number;
    }
  | {
      status: "capturing";
      utteranceId: string;
      rollingPrefixBytes: number;
      utteranceBytes: number;
    };
```

That is better than several booleans like `speechInProgress`, `hasStarted`, or `awaitingStop`.

## Immediate Buffering Strategy

Because buffering starts immediately, the detector does not decide whether audio is kept at all. It decides when buffered audio becomes an utterance.

### Rolling Prefix Buffer

Maintain a small ring buffer of recent PCM before speech start.

Suggested defaults:

- sample rate: `16000`
- mono PCM16
- prefix duration: `300ms` to `500ms`

Example utility:

```ts
interface RollingPcmBuffer {
  append(chunk: Buffer): void;
  drain(): Buffer;
  clear(): void;
}
```

Example implementation shape:

```ts
class FixedDurationPcmRingBuffer {
  private chunks: Buffer[] = [];
  private totalBytes = 0;

  constructor(private readonly maxBytes: number) {}

  append(chunk: Buffer): void {
    if (chunk.length === 0) {
      return;
    }

    this.chunks.push(chunk);
    this.totalBytes += chunk.length;

    while (this.totalBytes > this.maxBytes && this.chunks.length > 0) {
      const removed = this.chunks.shift()!;
      this.totalBytes -= removed.length;
    }
  }

  drain(): Buffer {
    return Buffer.concat(this.chunks);
  }

  clear(): void {
    this.chunks = [];
    this.totalBytes = 0;
  }
}
```

### Flow

Per incoming chunk:

```ts
prefixBuffer.append(chunk);
detector.appendPcm16(chunk);

if (state.status === "capturing") {
  utteranceChunks.push(chunk);
}
```

On speech start:

```ts
async function onSpeechStarted(): Promise<void> {
  await interruptPlaybackAndAgentRun();

  const prefix = prefixBuffer.drain();
  const utteranceChunks = prefix.length > 0 ? [prefix] : [];

  state = {
    status: "capturing",
    utteranceId: uuidv4(),
    rollingPrefixBytes: prefix.length,
    utteranceBytes: prefix.length,
  };

  activeUtteranceChunks = utteranceChunks;
}
```

On speech stop:

```ts
async function onSpeechStopped(): Promise<void> {
  if (state.status !== "capturing") {
    return;
  }

  const pcm16 = Buffer.concat(activeUtteranceChunks);

  await submitUtterance({
    pcm16,
    sampleRate: 16000,
    format: "audio/pcm;rate=16000;bits=16",
  });

  activeUtteranceChunks = [];
  state = {
    status: "listening",
    rollingPrefixBytes: 0,
  };
}
```

## STT Integration

Do not make the turn controller talk to STT one chunk at a time unless there is a strong need.

For the first version, the simplest shape is:

- detector runs on the continuous stream
- utterance audio is accumulated in memory
- on stop, the utterance goes through the existing internal voice dictation path

That minimizes refactor risk and keeps the first migration focused on authority and layering.

Boundary:

```ts
interface VoiceUtteranceSink {
  submitUtterance(input: {
    pcm16: Buffer;
    sampleRate: number;
    format: string;
  }): Promise<void>;
}
```

Then `session.ts` can implement that sink using the existing voice dictation internals.

## Session Refactor

Current problem:

- raw `voice_audio_chunk` handling triggers speech-start behavior too early
- the client remains the authority for `isLast`

Target shape:

```ts
private async handleAudioChunk(
  msg: Extract<SessionInboundMessage, { type: "voice_audio_chunk" }>
): Promise<void> {
  if (this.isVoiceMode) {
    await this.voiceTurnController.appendClientChunk({
      audioBase64: msg.audio,
      format: msg.format || "audio/pcm;rate=16000;bits=16",
    });
    return;
  }

  // existing non-voice path remains
}
```

And the controller calls back into the session:

```ts
interface VoiceTurnControllerCallbacks {
  onSpeechStarted(): Promise<void>;
  onUtteranceReady(input: {
    pcm16: Buffer;
    sampleRate: number;
    format: string;
  }): Promise<void>;
  onError(error: Error): void;
}
```

Session remains responsible for:

- aborting agent/TTS
- submitting transcript text to the agent
- emitting logs

The controller is responsible for:

- audio and detector state
- prefix buffering
- utterance assembly

## Client Refactor

The app should stop using `SpeechSegmenter` as authoritative segmentation in voice mode.

Instead, voice mode uses a continuous chunk sender:

```ts
interface ContinuousVoiceUploader {
  appendPcmChunk(chunk: Uint8Array): void;
  flush(): Promise<void>;
}
```

In `voice-runtime.ts`, the path becomes:

```ts
handleCapturePcm(chunk) {
  if (!state.snapshot.isVoiceMode || state.snapshot.isMuted) {
    return;
  }

  continuousUploader.appendPcmChunk(chunk);
}
```

And UI activation remains independent:

```ts
handleCaptureVolume(level) {
  const nowMs = Date.now();
  publishDisplayVolume(level, nowMs);

  const isActive = level > DISPLAY_ACTIVE_THRESHOLD;
  patchTelemetry((prev) => ({
    ...prev,
    isSpeaking: isActive,
  }));
}
```

The client should no longer use a “segmenter” abstraction for voice mode. The concept is now wrong for that layer.

## Bundling Silero

Silero VAD should be treated as a bundled runtime asset, not a user-downloaded speech model.

Implications:

- not listed in `paseo speech download`
- not part of user-facing missing-model readiness
- shipped with `packages/server`

Example:

```ts
function resolveBundledSileroVadModelPath(): string {
  return fileURLToPath(
    new URL("./assets/silero_vad.onnx", import.meta.url)
  );
}
```

That keeps the model an implementation detail of local realtime voice infrastructure.

## What Not To Do In V1

- No semantic turn detection
- No mixed authorities
- No client-side fallback turn detection
- No detector logic buried inside dictation manager
- No detector-specific branching spread through session logic

If local VAD is the authority, then only local VAD decides `speech_started` and `speech_stopped`.

## Verification Plan

### Unit Tests

`silero-vad-session.test.ts`

- emits `speech_started` after speech frames
- emits `speech_stopped` after silence frames
- does not emit duplicate starts/stops

`fixed-duration-pcm-ring-buffer.test.ts`

- retains only configured prefix window
- drains prefix in correct order

`voice-turn-controller.test.ts`

- buffers before speech start
- includes prefix in utterance on start
- finalizes one utterance on stop
- does not barge in on silence-only chunks

### Integration Tests

`session.voice-turn-control.test.ts`

- continuous voice chunks do not immediately interrupt agent output
- detector start triggers barge-in
- detector stop triggers one finalized transcript submission

`voice-local-agent.e2e.test.ts`

- local voice mode works with continuous client upload
- leading words are preserved because prefix buffering is included

### Regression

- dictation stream tests remain unchanged
- TTS playback tests remain unchanged
- app voice UI tests still verify meter/activation behavior

## Ordered Implementation Plan

1. Add server-side turn detection interfaces and config type.
2. Add bundled local Silero provider via Sherpa.
3. Add rolling prefix buffer utility.
4. Add `VoiceTurnController`.
5. Refactor `session.ts` voice path to use controller callbacks instead of client `isLast`.
6. Replace app voice segmentation with continuous PCM upload.
7. Keep app meter/activation visuals only.
8. Add tests bottom-up.
9. Run `npm run typecheck`.

## Suggested Canonical Types

```ts
interface DetectedVoiceUtterance {
  pcm16: Buffer;
  sampleRate: number;
  startedAt: number;
  endedAt: number;
}
```

```ts
interface VoiceTurnControllerCallbacks {
  onSpeechStarted(): Promise<void>;
  onUtteranceReady(utterance: DetectedVoiceUtterance): Promise<void>;
  onError(error: Error): void;
}
```

```ts
interface TurnDetectionProvider {
  id: "local" | "openai" | (string & {});
  createSession(input: {
    logger: pino.Logger;
  }): TurnDetectionSession;
}
```

## Recommendation

For v1, optimize for correctness and clean layering rather than minimum diff size:

- continuous upload from client
- bundled local Silero detector on server
- rolling prefix buffer
- detector-owned turn boundaries
- existing STT pipeline reused as utterance sink

That keeps responsibilities clear and avoids inventing a leaky “smart STT session” abstraction.
