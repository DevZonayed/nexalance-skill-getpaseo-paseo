import { z } from "zod";

import type { PersistedConfig } from "../../../persisted-config.js";
import type { RequestedSpeechProviders } from "../../speech-types.js";
import type { STTConfig } from "./stt.js";
import type { TTSConfig } from "./tts.js";

export const DEFAULT_OPENAI_REALTIME_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
export const DEFAULT_OPENAI_TTS_MODEL = "tts-1";

export type OpenAiSpeechProviderConfig = {
  apiKey?: string;
  stt?: Partial<STTConfig> & { apiKey?: string };
  tts?: Partial<TTSConfig> & { apiKey?: string };
  realtimeTranscriptionModel?: string;
};

const OpenAiTtsVoiceSchema = z.enum([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);

const OpenAiTtsModelSchema = z.enum(["tts-1", "tts-1-hd"]);

const OptionalFiniteNumberSchema = z.preprocess((value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") {
    return value;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}, z.number().optional());

const OptionalTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const OpenAiSpeechResolutionSchema = z.object({
  apiKey: OptionalTrimmedStringSchema,
  sttConfidenceThreshold: OptionalFiniteNumberSchema,
  sttModel: OptionalTrimmedStringSchema,
  ttsVoice: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
  }, OpenAiTtsVoiceSchema.default("alloy")),
  ttsModel: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
  }, OpenAiTtsModelSchema.default(DEFAULT_OPENAI_TTS_MODEL)),
  realtimeTranscriptionModel: OptionalTrimmedStringSchema.default(
    DEFAULT_OPENAI_REALTIME_TRANSCRIPTION_MODEL
  ),
});

export function resolveOpenAiSpeechConfig(params: {
  env: NodeJS.ProcessEnv;
  persisted: PersistedConfig;
  providers: RequestedSpeechProviders;
}): OpenAiSpeechProviderConfig | undefined {
  const parsed = OpenAiSpeechResolutionSchema.parse({
    apiKey: params.env.OPENAI_API_KEY ?? params.persisted.providers?.openai?.apiKey,
    sttConfidenceThreshold:
      params.env.STT_CONFIDENCE_THRESHOLD ??
      params.persisted.features?.dictation?.stt?.confidenceThreshold,
    sttModel:
      params.env.STT_MODEL ??
      (params.providers.voiceSttProvider === "openai"
        ? params.persisted.features?.voiceMode?.stt?.model
        : undefined) ??
      (params.providers.dictationSttProvider === "openai"
        ? params.persisted.features?.dictation?.stt?.model
        : undefined),
    ttsVoice:
      params.env.TTS_VOICE ??
      (params.providers.voiceTtsProvider === "openai"
        ? params.persisted.features?.voiceMode?.tts?.voice
        : undefined) ??
      "alloy",
    ttsModel:
      params.env.TTS_MODEL ??
      (params.providers.voiceTtsProvider === "openai"
        ? params.persisted.features?.voiceMode?.tts?.model
        : undefined) ??
      DEFAULT_OPENAI_TTS_MODEL,
    realtimeTranscriptionModel:
      params.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ??
      (params.providers.dictationSttProvider === "openai"
        ? params.persisted.features?.dictation?.stt?.model
        : undefined) ??
      DEFAULT_OPENAI_REALTIME_TRANSCRIPTION_MODEL,
  });

  if (!parsed.apiKey) {
    return undefined;
  }

  return {
    apiKey: parsed.apiKey,
    stt: {
      apiKey: parsed.apiKey,
      ...(parsed.sttConfidenceThreshold !== undefined
        ? { confidenceThreshold: parsed.sttConfidenceThreshold }
        : {}),
      ...(parsed.sttModel
        ? { model: parsed.sttModel }
        : {}),
    },
    tts: {
      apiKey: parsed.apiKey,
      voice: parsed.ttsVoice,
      model: parsed.ttsModel,
      responseFormat: "pcm",
    },
    realtimeTranscriptionModel: parsed.realtimeTranscriptionModel,
  };
}
