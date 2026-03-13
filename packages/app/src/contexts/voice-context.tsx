import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useSessionStore } from "@/stores/session-store";
import { createAudioEngine } from "@/voice/audio-engine";
import type { AudioEngine } from "@/voice/audio-engine-types";
import {
  createVoiceRuntime,
  type VoiceRuntime,
  type VoiceRuntimeSnapshot,
  type VoiceRuntimeTelemetrySnapshot,
} from "@/voice/voice-runtime";

interface VoiceContextValue extends VoiceRuntimeSnapshot {
  startVoice: (serverId: string, agentId: string) => Promise<void>;
  stopVoice: () => Promise<void>;
  isVoiceModeForAgent: (serverId: string, agentId: string) => boolean;
  toggleMute: () => void;
}

const EMPTY_SNAPSHOT: VoiceRuntimeSnapshot = {
  phase: "disabled",
  isVoiceMode: false,
  isVoiceSwitching: false,
  isMuted: false,
  activeServerId: null,
  activeAgentId: null,
};

const EMPTY_TELEMETRY: VoiceRuntimeTelemetrySnapshot = {
  volume: 0,
  isDetecting: false,
  isSpeaking: false,
  segmentDuration: 0,
};

const VoiceRuntimeContext = createContext<VoiceRuntime | null>(null);
const VoiceAudioEngineContext = createContext<AudioEngine | null>(null);

const noopSubscribe = () => () => {};
const getEmptySnapshot = () => EMPTY_SNAPSHOT;
const getEmptyTelemetry = () => EMPTY_TELEMETRY;
let nextVoiceProviderInstanceId = 1;

function getProviderTraceStack(): string | undefined {
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

export function useVoice() {
  const value = useVoiceOptional();
  if (!value) {
    throw new Error("useVoice must be used within VoiceProvider");
  }
  return value;
}

export function useVoiceOptional(): VoiceContextValue | null {
  const runtime = useContext(VoiceRuntimeContext);
  const snapshot = useSyncExternalStore(
    runtime ? runtime.subscribe : noopSubscribe,
    runtime ? runtime.getSnapshot : getEmptySnapshot,
    runtime ? runtime.getSnapshot : getEmptySnapshot
  );

  if (!runtime) {
    return null;
  }

  return {
    ...snapshot,
    startVoice: runtime.startVoice,
    stopVoice: runtime.stopVoice,
    isVoiceModeForAgent: runtime.isVoiceModeForAgent,
    toggleMute: runtime.toggleMute,
  };
}

export function useVoiceTelemetry() {
  const telemetry = useVoiceTelemetryOptional();
  if (!telemetry) {
    throw new Error("useVoiceTelemetry must be used within VoiceProvider");
  }
  return telemetry;
}

export function useVoiceTelemetryOptional(): VoiceRuntimeTelemetrySnapshot | null {
  const runtime = useContext(VoiceRuntimeContext);
  const snapshot = useSyncExternalStore(
    runtime ? runtime.subscribeTelemetry : noopSubscribe,
    runtime ? runtime.getTelemetrySnapshot : getEmptyTelemetry,
    runtime ? runtime.getTelemetrySnapshot : getEmptyTelemetry
  );

  return runtime ? snapshot : null;
}

export function useVoiceRuntimeOptional(): VoiceRuntime | null {
  return useContext(VoiceRuntimeContext);
}

export function useVoiceAudioEngineOptional(): AudioEngine | null {
  return useContext(VoiceAudioEngineContext);
}

interface VoiceProviderProps {
  children: ReactNode;
}

export function VoiceProvider({ children }: VoiceProviderProps) {
  const providerIdRef = useRef<number | null>(null);
  if (providerIdRef.current === null) {
    providerIdRef.current = nextVoiceProviderInstanceId++;
    console.log("[VoiceProvider] instance_created", {
      providerId: providerIdRef.current,
      stack: getProviderTraceStack(),
    });
  }

  const providerId = providerIdRef.current;
  const engineRef = useRef<AudioEngine | null>(null);
  const runtimeRef = useRef<VoiceRuntime | null>(null);
  console.log("[VoiceProvider] render", {
    providerId,
    hasEngine: Boolean(engineRef.current),
    hasRuntime: Boolean(runtimeRef.current),
  });

  if (!engineRef.current) {
    let runtime: VoiceRuntime | null = null;
    console.log("[VoiceProvider] create_engine_and_runtime");
    const engine = createAudioEngine({
      onCaptureData: (pcm) => {
        console.log("[VoiceProvider] onCaptureData", {
          providerId,
          bytes: pcm.byteLength,
        });
        runtime?.handleCapturePcm(pcm);
      },
      onVolumeLevel: (level) => {
        console.log("[VoiceProvider] onVolumeLevel", {
          providerId,
          level,
        });
        runtime?.handleCaptureVolume(level);
      },
      onError: (error) => {
        console.error("[VoiceEngine] Capture error:", error);
      },
    }, {
      traceLabel: `voice-provider:${providerId}`,
    });

    runtime = createVoiceRuntime({
      engine,
      getServerInfo: (serverId) =>
        useSessionStore.getState().getSession(serverId)?.serverInfo ?? null,
      activateKeepAwake: async (tag) => {
        await activateKeepAwakeAsync(tag);
      },
      deactivateKeepAwake: async (tag) => {
        await deactivateKeepAwake(tag);
      },
    });

    engineRef.current = engine;
    runtimeRef.current = runtime;
  }

  const engine = engineRef.current!;
  const runtime = runtimeRef.current!;

  useEffect(() => {
    console.log("[VoiceProvider] mount", {
      providerId,
    });
    return () => {
      console.log("[VoiceProvider] unmount", {
        providerId,
      });
      void runtime.destroy().catch((error) => {
        console.error("[VoiceProvider] Failed to destroy voice runtime", error);
      });
    };
  }, [providerId, runtime]);

  return (
    <VoiceAudioEngineContext.Provider value={engine}>
      <VoiceRuntimeContext.Provider value={runtime}>
        {children}
      </VoiceRuntimeContext.Provider>
    </VoiceAudioEngineContext.Provider>
  );
}
