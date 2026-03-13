import { useCallback, useEffect, useRef } from "react";
import { Buffer } from "buffer";
import { useState } from "react";

import { createAudioEngine } from "@/voice/audio-engine";

import type { DictationAudioSource, DictationAudioSourceConfig } from "./use-dictation-audio-source.types";

let nextDictationAudioSourceInstanceId = 1;

function getDictationTraceStack(): string | undefined {
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

export function useDictationAudioSource(config: DictationAudioSourceConfig): DictationAudioSource {
  const onPcmSegmentRef = useRef(config.onPcmSegment);
  const onErrorRef = useRef(config.onError);
  const [volume, setVolume] = useState(0);
  const sourceIdRef = useRef<number | null>(null);
  const engineRef = useRef<ReturnType<typeof createAudioEngine> | null>(null);

  if (sourceIdRef.current === null) {
    sourceIdRef.current = nextDictationAudioSourceInstanceId++;
    console.log("[DictationAudioSource] instance_created", {
      sourceId: sourceIdRef.current,
      stack: getDictationTraceStack(),
    });
  }

  const sourceId = sourceIdRef.current;

  console.log("[DictationAudioSource] render", {
    sourceId,
    hasEngine: Boolean(engineRef.current),
  });

  const getOrCreateEngine = useCallback(() => {
    if (engineRef.current) {
      return engineRef.current;
    }

    console.log("[DictationAudioSource] create_engine", {
      sourceId,
      stack: getDictationTraceStack(),
    });
    engineRef.current = createAudioEngine(
      {
      onCaptureData: (pcm) => {
        onPcmSegmentRef.current(Buffer.from(pcm).toString("base64"));
      },
      onVolumeLevel: (level) => {
        setVolume(level);
      },
      onError: (error) => {
        onErrorRef.current?.(error);
      },
      },
      {
        traceLabel: `dictation:${sourceId}`,
      }
    );
    return engineRef.current;
  }, [sourceId]);

  useEffect(() => {
    onPcmSegmentRef.current = config.onPcmSegment;
    onErrorRef.current = config.onError;
  }, [config.onPcmSegment, config.onError]);

  useEffect(() => {
    console.log("[DictationAudioSource] mount", {
      sourceId,
    });
    return () => {
      console.log("[DictationAudioSource] unmount", {
        sourceId,
      });
    };
  }, [sourceId]);

  const start = useCallback(async () => {
    console.log("[DictationAudioSource] start", {
      sourceId,
    });
    const engine = getOrCreateEngine();
    await engine.initialize();
    await engine.startCapture();
  }, [getOrCreateEngine, sourceId]);

  const stop = useCallback(async () => {
    console.log("[DictationAudioSource] stop", {
      sourceId,
      hasEngine: Boolean(engineRef.current),
    });
    await engineRef.current?.stopCapture();
    setVolume(0);
  }, [sourceId]);

  useEffect(() => {
    return () => {
      const engine = engineRef.current;
      engineRef.current = null;
      console.log("[DictationAudioSource] destroy_engine", {
        sourceId,
        hadEngine: Boolean(engine),
      });
      void engine?.destroy().catch(() => undefined);
    };
  }, [sourceId]);

  return {
    start,
    stop,
    volume,
  };
}
