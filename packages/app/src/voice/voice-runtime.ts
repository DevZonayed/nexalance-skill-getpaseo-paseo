import type { AgentStreamEventPayload } from "@server/shared/messages";
import { resolveVoiceUnavailableMessage } from "@/utils/server-info-capabilities";
import type { DaemonServerInfo } from "@/stores/session-store";
import type { AudioEngine } from "@/voice/audio-engine-types";
import { REALTIME_VOICE_VAD_CONFIG } from "@/voice/realtime-voice-config";
import { SpeechSegmenter } from "@/voice/speech-segmenter";

const PCM_MIME_TYPE = "audio/pcm;rate=16000;bits=16";
const KEEP_AWAKE_TAG = "paseo:voice";
const THINKING_TONE_REPEAT_GAP_MS = 350;
const DISPLAY_VOLUME_PUBLISH_INTERVAL_MS = 120;
const DISPLAY_VOLUME_CHANGE_EPSILON = 0.02;
const DISPLAY_VOLUME_ATTACK = 0.35;
const DISPLAY_VOLUME_RELEASE = 0.18;

type TurnEventType = Extract<
  AgentStreamEventPayload["type"],
  "turn_started" | "turn_completed" | "turn_failed" | "turn_canceled"
>;

export type VoiceRuntimePhase =
  | "disabled"
  | "starting"
  | "listening"
  | "capturing"
  | "submitting"
  | "waiting"
  | "playing"
  | "stopping";

export interface VoiceRuntimeSnapshot {
  phase: VoiceRuntimePhase;
  isVoiceMode: boolean;
  isVoiceSwitching: boolean;
  isMuted: boolean;
  activeServerId: string | null;
  activeAgentId: string | null;
}

export interface VoiceRuntimeTelemetrySnapshot {
  volume: number;
  isDetecting: boolean;
  isSpeaking: boolean;
  segmentDuration: number;
}

export interface VoiceSessionAdapter {
  serverId: string;
  setVoiceMode(enabled: boolean, agentId?: string): Promise<void>;
  sendVoiceAudioChunk(
    audioData: string,
    mimeType: string,
    isLast: boolean
  ): Promise<void>;
  abortRequest(): Promise<void>;
  setAssistantAudioPlaying(isPlaying: boolean): void;
}

export interface VoiceRuntimeDeps {
  engine: AudioEngine;
  getServerInfo(serverId: string): DaemonServerInfo | null;
  activateKeepAwake(tag: string): Promise<void>;
  deactivateKeepAwake(tag: string): Promise<void>;
}

interface RuntimeSessionState {
  adapter: VoiceSessionAdapter;
  connected: boolean;
}

interface RuntimeState {
  snapshot: VoiceRuntimeSnapshot;
  telemetry: VoiceRuntimeTelemetrySnapshot;
  turnInProgress: boolean;
  transportReady: boolean;
  generation: number;
  speechInterruptTimer: ReturnType<typeof setTimeout> | null;
  speechInterruptSent: boolean;
  segmentDurationTimer: ReturnType<typeof setInterval> | null;
  lastDisplayVolumePublishMs: number;
}

const INITIAL_SNAPSHOT: VoiceRuntimeSnapshot = {
  phase: "disabled",
  isVoiceMode: false,
  isVoiceSwitching: false,
  isMuted: false,
  activeServerId: null,
  activeAgentId: null,
};

const INITIAL_TELEMETRY: VoiceRuntimeTelemetrySnapshot = {
  volume: 0,
  isDetecting: false,
  isSpeaking: false,
  segmentDuration: 0,
};

function logVoiceRuntime(
  event: string,
  details?: Record<string, unknown>
): void {
  if (details) {
    console.log(`[VoiceRuntime] ${event}`, details);
    return;
  }
  console.log(`[VoiceRuntime] ${event}`);
}

function snapshotsEqual(
  left: VoiceRuntimeSnapshot,
  right: VoiceRuntimeSnapshot
): boolean {
  return (
    left.phase === right.phase &&
    left.isVoiceMode === right.isVoiceMode &&
    left.isVoiceSwitching === right.isVoiceSwitching &&
    left.isMuted === right.isMuted &&
    left.activeServerId === right.activeServerId &&
    left.activeAgentId === right.activeAgentId
  );
}

function telemetryEqual(
  left: VoiceRuntimeTelemetrySnapshot,
  right: VoiceRuntimeTelemetrySnapshot
): boolean {
  return (
    left.volume === right.volume &&
    left.isDetecting === right.isDetecting &&
    left.isSpeaking === right.isSpeaking &&
    left.segmentDuration === right.segmentDuration
  );
}

export interface VoiceRuntime {
  subscribe(listener: () => void): () => void;
  getSnapshot(): VoiceRuntimeSnapshot;
  subscribeTelemetry(listener: () => void): () => void;
  getTelemetrySnapshot(): VoiceRuntimeTelemetrySnapshot;
  registerSession(adapter: VoiceSessionAdapter): () => void;
  updateSessionConnection(serverId: string, connected: boolean): void;
  handleCapturePcm(chunk: Uint8Array): void;
  handleCaptureVolume(level: number): void;
  startVoice(serverId: string, agentId: string): Promise<void>;
  stopVoice(): Promise<void>;
  destroy(): Promise<void>;
  toggleMute(): void;
  isVoiceModeForAgent(serverId: string, agentId: string): boolean;
  shouldPlayVoiceAudio(serverId: string): boolean;
  onAssistantAudioStarted(serverId: string): void;
  onAssistantAudioFinished(serverId: string): void;
  onTranscriptionResult(serverId: string, text: string): void;
  onTurnEvent(serverId: string, agentId: string, eventType: TurnEventType): void;
}

export function createVoiceRuntime(deps: VoiceRuntimeDeps): VoiceRuntime {
  const listeners = new Set<() => void>();
  const telemetryListeners = new Set<() => void>();
  const sessions = new Map<string, RuntimeSessionState>();
  const state: RuntimeState = {
    snapshot: INITIAL_SNAPSHOT,
    telemetry: INITIAL_TELEMETRY,
    turnInProgress: false,
    transportReady: false,
    generation: 0,
    speechInterruptTimer: null,
    speechInterruptSent: false,
    segmentDurationTimer: null,
    lastDisplayVolumePublishMs: 0,
  };

  function emit(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function emitTelemetry(): void {
    for (const listener of telemetryListeners) {
      listener();
    }
  }

  function patchSnapshot(
    patch:
      | Partial<VoiceRuntimeSnapshot>
      | ((previous: VoiceRuntimeSnapshot) => VoiceRuntimeSnapshot)
  ): void {
    const next =
      typeof patch === "function"
        ? patch(state.snapshot)
        : { ...state.snapshot, ...patch };
    if (snapshotsEqual(next, state.snapshot)) {
      return;
    }
    const previous = state.snapshot;
    state.snapshot = next;
    logVoiceRuntime("snapshot_changed", {
      previousPhase: previous.phase,
      phase: next.phase,
      isVoiceMode: next.isVoiceMode,
      isVoiceSwitching: next.isVoiceSwitching,
      isMuted: next.isMuted,
      activeServerId: next.activeServerId,
      activeAgentId: next.activeAgentId,
    });
    emit();
  }

  function patchTelemetry(
    patch:
      | Partial<VoiceRuntimeTelemetrySnapshot>
      | ((
          previous: VoiceRuntimeTelemetrySnapshot
        ) => VoiceRuntimeTelemetrySnapshot)
  ): void {
    const next =
      typeof patch === "function"
        ? patch(state.telemetry)
        : { ...state.telemetry, ...patch };
    if (telemetryEqual(next, state.telemetry)) {
      return;
    }
    state.telemetry = next;
    emitTelemetry();
  }

  function getActiveSession(): RuntimeSessionState | null {
    if (!state.snapshot.activeServerId) {
      return null;
    }
    return sessions.get(state.snapshot.activeServerId) ?? null;
  }

  function clearSpeechInterruptTimer(): void {
    if (state.speechInterruptTimer) {
      clearTimeout(state.speechInterruptTimer);
      state.speechInterruptTimer = null;
    }
  }

  function clearSegmentDurationTimer(): void {
    if (state.segmentDurationTimer) {
      clearInterval(state.segmentDurationTimer);
      state.segmentDurationTimer = null;
    }
  }

  function reconcileSegmentDurationTimer(
    segmenter: SpeechSegmenter
  ): void {
    if (!state.telemetry.isDetecting && !state.telemetry.isSpeaking) {
      clearSegmentDurationTimer();
      patchTelemetry((prev) => ({ ...prev, segmentDuration: 0 }));
      return;
    }

    if (state.segmentDurationTimer) {
      return;
    }

    state.segmentDurationTimer = setInterval(() => {
      const startedAt = segmenter.getSpeechDetectionStartMs();
      patchTelemetry((prev) => ({
        ...prev,
        segmentDuration: startedAt ? Date.now() - startedAt : 0,
      }));
    }, 100);
  }

  function canPlayCue(): boolean {
    return (
      state.snapshot.isVoiceMode &&
      state.snapshot.phase === "waiting" &&
      !state.telemetry.isDetecting &&
      !state.telemetry.isSpeaking
    );
  }

  function stopCue(): void {
    deps.engine.stopLooping();
  }

  function resetSegmenter(segmenter: SpeechSegmenter): void {
    segmenter.reset();
    clearSpeechInterruptTimer();
    clearSegmentDurationTimer();
    patchTelemetry({ ...INITIAL_TELEMETRY });
  }

  function reconcileCue(): void {
    if (!canPlayCue()) {
      stopCue();
      return;
    }
    logVoiceRuntime("thinking_tone_requested", {
      phase: state.snapshot.phase,
      isDetecting: state.telemetry.isDetecting,
      isSpeaking: state.telemetry.isSpeaking,
    });
    deps.engine.playLooping(new Uint8Array(0), THINKING_TONE_REPEAT_GAP_MS);
  }

  async function interruptActiveTurn(): Promise<void> {
    const activeSession = getActiveSession();
    if (!activeSession) {
      return;
    }

    stopCue();
    deps.engine.stop();
    deps.engine.clearQueue();
    activeSession.adapter.setAssistantAudioPlaying(false);
    patchSnapshot((prev) => ({ ...prev, phase: "capturing" }));

    try {
      await activeSession.adapter.abortRequest();
    } catch (error) {
      console.error("[VoiceRuntime] Failed to abort active turn:", error);
    }
  }

  const segmenter = new SpeechSegmenter(
    {
      enableContinuousStreaming: false,
      volumeThreshold: REALTIME_VOICE_VAD_CONFIG.volumeThreshold,
      confirmedDropGracePeriodMs:
        REALTIME_VOICE_VAD_CONFIG.confirmedDropGracePeriodMs,
      silenceDurationMs: REALTIME_VOICE_VAD_CONFIG.silenceDurationMs,
      speechConfirmationMs: REALTIME_VOICE_VAD_CONFIG.speechConfirmationMs,
      detectionGracePeriodMs: REALTIME_VOICE_VAD_CONFIG.detectionGracePeriodMs,
    },
    {
      onAudioSegment: ({ audioData, isLast }) => {
        const activeSession = getActiveSession();
        if (!activeSession || !state.transportReady || !state.snapshot.isVoiceMode) {
          return;
        }

        const generation = state.generation;
        patchSnapshot((prev) => ({
          ...prev,
          phase: isLast ? "submitting" : "capturing",
        }));
        if (isLast) {
          state.turnInProgress = true;
        }
        logVoiceRuntime("audio_segment_ready", {
          isLast,
          base64Bytes: audioData.length,
          phase: state.snapshot.phase,
          serverId: activeSession.adapter.serverId,
        });

        void activeSession.adapter
          .sendVoiceAudioChunk(audioData, PCM_MIME_TYPE, isLast)
          .then(() => {
            if (
              !isLast ||
              generation !== state.generation ||
              !state.snapshot.isVoiceMode ||
              state.snapshot.activeServerId !== activeSession.adapter.serverId ||
              state.snapshot.phase !== "submitting"
            ) {
              return;
            }
            logVoiceRuntime("audio_segment_sent", {
              isLast,
              serverId: activeSession.adapter.serverId,
            });
            patchSnapshot((prev) => ({ ...prev, phase: "waiting" }));
            reconcileCue();
          })
          .catch((error) => {
            console.error("[VoiceRuntime] Failed to send audio segment:", error);
          });
      },
      onSpeechStart: () => {
        logVoiceRuntime("speech_started");
        stopCue();
      },
      onSpeechEnd: () => {
        logVoiceRuntime("speech_ended");
        clearSpeechInterruptTimer();
        state.speechInterruptSent = false;
        reconcileCue();
      },
      onDetectingChange: (isDetecting) => {
        const previous = state.telemetry;
        patchTelemetry((prev) => ({ ...prev, isDetecting }));
        if (previous.isDetecting !== isDetecting) {
          logVoiceRuntime("detecting_changed", {
            isDetecting,
            volume: Number(state.telemetry.volume.toFixed(3)),
          });
        }
        if (!previous.isDetecting && isDetecting) {
          stopCue();
        }
        reconcileSegmentDurationTimer(segmenter);
        reconcileCue();
      },
      onSpeakingChange: (isSpeaking) => {
        const previous = state.telemetry;
        patchTelemetry((prev) => ({ ...prev, isSpeaking }));
        if (previous.isSpeaking !== isSpeaking) {
          logVoiceRuntime("speaking_changed", {
            isSpeaking,
            phase: state.snapshot.phase,
            volume: Number(state.telemetry.volume.toFixed(3)),
          });
        }

        if (!previous.isSpeaking && isSpeaking) {
          stopCue();
          if (
            state.snapshot.phase === "waiting" ||
            state.snapshot.phase === "playing"
          ) {
            clearSpeechInterruptTimer();
            state.speechInterruptTimer = setTimeout(() => {
              state.speechInterruptTimer = null;
              if (
                state.speechInterruptSent ||
                !state.snapshot.isVoiceMode ||
                !state.telemetry.isSpeaking
              ) {
                return;
              }
              state.speechInterruptSent = true;
              logVoiceRuntime("barge_in_interrupt_triggered", {
                phase: state.snapshot.phase,
              });
              void interruptActiveTurn();
            }, REALTIME_VOICE_VAD_CONFIG.interruptGracePeriodMs);
            logVoiceRuntime("barge_in_interrupt_scheduled", {
              gracePeriodMs: REALTIME_VOICE_VAD_CONFIG.interruptGracePeriodMs,
              phase: state.snapshot.phase,
            });
          }
        }

        if (!isSpeaking) {
          clearSpeechInterruptTimer();
          state.speechInterruptSent = false;
        }

        reconcileSegmentDurationTimer(segmenter);
        reconcileCue();
      },
    }
  );

  function resetToDisabledState(): void {
    state.transportReady = false;
    state.turnInProgress = false;
    state.speechInterruptSent = false;
    state.lastDisplayVolumePublishMs = 0;
    resetSegmenter(segmenter);
    patchSnapshot({ ...INITIAL_SNAPSHOT });
  }

  function publishDisplayVolume(level: number, nowMs: number): void {
    const previousVolume = state.telemetry.volume;
    const smoothing =
      level >= previousVolume ? DISPLAY_VOLUME_ATTACK : DISPLAY_VOLUME_RELEASE;
    const nextVolume = Math.max(
      0,
      Math.min(1, previousVolume + (level - previousVolume) * smoothing)
    );
    const enoughTimeElapsed =
      nowMs - state.lastDisplayVolumePublishMs >=
      DISPLAY_VOLUME_PUBLISH_INTERVAL_MS;
    const enoughChange =
      Math.abs(nextVolume - previousVolume) >= DISPLAY_VOLUME_CHANGE_EPSILON;

    if (!enoughTimeElapsed && !enoughChange) {
      return;
    }

    state.lastDisplayVolumePublishMs = nowMs;
    patchTelemetry((prev) => ({
      ...prev,
      volume: Number(nextVolume.toFixed(3)),
    }));
  }

  async function performLocalStop(): Promise<void> {
    stopCue();
    deps.engine.stop();
    deps.engine.clearQueue();
    await deps.engine.stopCapture().catch(() => undefined);
    await deps.deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    getActiveSession()?.adapter.setAssistantAudioPlaying(false);
    resetToDisabledState();
  }

  async function resyncVoiceMode(serverId: string): Promise<void> {
    if (
      !state.snapshot.isVoiceMode ||
      state.snapshot.activeServerId !== serverId ||
      !state.snapshot.activeAgentId
    ) {
      return;
    }

    const activeSession = getActiveSession();
    if (!activeSession || !activeSession.connected) {
      return;
    }

    patchSnapshot((prev) => ({ ...prev, isVoiceSwitching: true }));
    try {
      await activeSession.adapter.setVoiceMode(true, state.snapshot.activeAgentId);
      state.transportReady = true;
    } finally {
      patchSnapshot((prev) => ({ ...prev, isVoiceSwitching: false }));
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return state.snapshot;
    },

    subscribeTelemetry(listener) {
      telemetryListeners.add(listener);
      return () => {
        telemetryListeners.delete(listener);
      };
    },

    getTelemetrySnapshot() {
      return state.telemetry;
    },

    registerSession(adapter) {
      logVoiceRuntime("session_registered", {
        serverId: adapter.serverId,
      });
      sessions.set(adapter.serverId, {
        adapter,
        connected: true,
      });

      return () => {
        const activeServerId = state.snapshot.activeServerId;
        sessions.delete(adapter.serverId);
        if (activeServerId === adapter.serverId) {
          void performLocalStop();
        }
      };
    },

    updateSessionConnection(serverId, connected) {
      const session = sessions.get(serverId);
      if (!session) {
        return;
      }
      session.connected = connected;
      logVoiceRuntime("session_connection_changed", {
        serverId,
        connected,
      });
      if (state.snapshot.activeServerId !== serverId) {
        return;
      }
      if (!connected) {
        state.transportReady = false;
        return;
      }
      void resyncVoiceMode(serverId);
    },

    handleCapturePcm(chunk) {
      console.log("[VoiceRuntime] handleCapturePcm", {
        bytes: chunk.byteLength,
        isVoiceMode: state.snapshot.isVoiceMode,
        isMuted: state.snapshot.isMuted,
        phase: state.snapshot.phase,
      });
      if (!state.snapshot.isVoiceMode || state.snapshot.isMuted) {
        return;
      }
      segmenter.pushPcmChunk(chunk);
    },

    handleCaptureVolume(level) {
      const nowMs = Date.now();
      console.log("[VoiceRuntime] handleCaptureVolume", {
        level,
        isVoiceMode: state.snapshot.isVoiceMode,
        isMuted: state.snapshot.isMuted,
        phase: state.snapshot.phase,
      });
      const displayLevel = state.snapshot.isMuted ? 0 : level;
      publishDisplayVolume(displayLevel, nowMs);
      if (!state.snapshot.isVoiceMode || state.snapshot.isMuted) {
        return;
      }
      segmenter.pushVolumeLevel(level, nowMs);
    },

    async startVoice(serverId, agentId) {
      logVoiceRuntime("start_requested", {
        serverId,
        agentId,
      });
      const session = sessions.get(serverId);
      if (!session) {
        throw new Error(`Voice runtime is not ready for host ${serverId}`);
      }
      if (!session.connected) {
        throw new Error(`Host ${serverId} is not connected`);
      }

      const serverInfo = deps.getServerInfo(serverId);
      const unavailableMessage = resolveVoiceUnavailableMessage({
        serverInfo,
        mode: "voice",
      });
      if (unavailableMessage) {
        throw new Error(unavailableMessage);
      }

      const previousServerId = state.snapshot.activeServerId;
      const previousAgentId = state.snapshot.activeAgentId;
      const generation = state.generation + 1;
      state.generation = generation;
      state.transportReady = false;
      patchSnapshot((prev) => ({
        ...prev,
        isVoiceSwitching: true,
        phase: "starting",
        activeServerId: serverId,
        activeAgentId: agentId,
      }));

      try {
        if (
          state.snapshot.isVoiceMode &&
          previousServerId &&
          (previousServerId !== serverId || previousAgentId !== agentId)
        ) {
          const previousSession = sessions.get(previousServerId);
          if (previousSession) {
            previousSession.adapter.setAssistantAudioPlaying(false);
            await previousSession.adapter.setVoiceMode(false);
          }
        }

        await deps.activateKeepAwake(KEEP_AWAKE_TAG).catch((error) => {
          console.warn("[VoiceRuntime] Failed to activate keep-awake:", error);
        });

        await deps.engine.initialize();
        await session.adapter.setVoiceMode(true, agentId);
        await deps.engine.startCapture();
        if (state.generation !== generation) {
          return;
        }

        state.transportReady = true;
        state.turnInProgress = false;
        resetSegmenter(segmenter);
        patchSnapshot((prev) => ({
          ...prev,
          isVoiceMode: true,
          isVoiceSwitching: false,
          phase: "listening",
          isMuted: deps.engine.isMuted(),
        }));
        logVoiceRuntime("start_completed", {
          serverId,
          agentId,
        });
      } catch (error) {
        logVoiceRuntime("start_failed", {
          serverId,
          agentId,
          error: error instanceof Error ? error.message : String(error),
        });
        await performLocalStop();
        throw error;
      }
    },

    async stopVoice() {
      logVoiceRuntime("stop_requested", {
        activeServerId: state.snapshot.activeServerId,
        activeAgentId: state.snapshot.activeAgentId,
      });
      const activeSession = getActiveSession();
      const generation = state.generation + 1;
      state.generation = generation;
      patchSnapshot((prev) => ({
        ...prev,
        isVoiceSwitching: true,
        phase: "stopping",
      }));

      try {
        state.transportReady = false;
        stopCue();
        deps.engine.stop();
        deps.engine.clearQueue();
        activeSession?.adapter.setAssistantAudioPlaying(false);
        if (activeSession) {
          await activeSession.adapter.setVoiceMode(false);
        }
        await deps.engine.stopCapture();
        await deps.deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
      } finally {
        if (state.generation === generation) {
          resetToDisabledState();
        }
        logVoiceRuntime("stop_completed");
      }
    },

    async destroy() {
      await this.stopVoice().catch(() => undefined);
      await deps.engine.destroy();
      listeners.clear();
      telemetryListeners.clear();
      sessions.clear();
    },

    toggleMute() {
      const nextMuted = deps.engine.toggleMute();
      logVoiceRuntime("mute_toggled", {
        muted: nextMuted,
      });
      if (nextMuted) {
        resetSegmenter(segmenter);
        patchSnapshot((prev) => ({
          ...prev,
          isMuted: true,
        }));
        reconcileCue();
        return;
      }

      patchSnapshot((prev) => ({ ...prev, isMuted: false }));
    },

    isVoiceModeForAgent(serverId, agentId) {
      return (
        state.snapshot.isVoiceMode &&
        state.snapshot.activeServerId === serverId &&
        state.snapshot.activeAgentId === agentId
      );
    },

    shouldPlayVoiceAudio(serverId) {
      return (
        state.snapshot.isVoiceMode &&
        state.snapshot.activeServerId === serverId &&
        state.snapshot.phase !== "stopping" &&
        state.snapshot.phase !== "disabled" &&
        !state.telemetry.isDetecting &&
        !state.telemetry.isSpeaking
      );
    },

    onAssistantAudioStarted(serverId) {
      if (
        !state.snapshot.isVoiceMode ||
        state.snapshot.activeServerId !== serverId
      ) {
        return;
      }
      logVoiceRuntime("assistant_audio_started", {
        serverId,
      });
      stopCue();
      getActiveSession()?.adapter.setAssistantAudioPlaying(true);
      patchSnapshot((prev) => ({ ...prev, phase: "playing" }));
    },

    onAssistantAudioFinished(serverId) {
      if (state.snapshot.activeServerId !== serverId) {
        return;
      }

      logVoiceRuntime("assistant_audio_finished", {
        serverId,
        turnInProgress: state.turnInProgress,
      });
      getActiveSession()?.adapter.setAssistantAudioPlaying(false);
      if (!state.snapshot.isVoiceMode) {
        return;
      }

      if (state.turnInProgress) {
        patchSnapshot((prev) => ({ ...prev, phase: "waiting" }));
        reconcileCue();
        return;
      }

      patchSnapshot((prev) => ({ ...prev, phase: "listening" }));
      reconcileCue();
    },

    onTranscriptionResult(serverId, text) {
      if (
        serverId !== state.snapshot.activeServerId ||
        !state.snapshot.isVoiceMode
      ) {
        return;
      }

      if (text.trim()) {
        return;
      }

      logVoiceRuntime("empty_transcription_result", {
        serverId,
      });
      state.turnInProgress = false;
      patchSnapshot((prev) => ({ ...prev, phase: "listening" }));
      stopCue();
    },

    onTurnEvent(serverId, agentId, eventType) {
      if (
        !state.snapshot.isVoiceMode ||
        state.snapshot.activeServerId !== serverId ||
        state.snapshot.activeAgentId !== agentId
      ) {
        return;
      }
      logVoiceRuntime("turn_event", {
        serverId,
        agentId,
        eventType,
      });

      if (eventType === "turn_started") {
        state.turnInProgress = true;
        return;
      }

      state.turnInProgress = false;
      if (state.snapshot.phase !== "playing") {
        patchSnapshot((prev) => ({ ...prev, phase: "listening" }));
      }
      stopCue();
    },
  };
}
