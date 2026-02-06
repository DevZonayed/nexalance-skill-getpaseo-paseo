import path from "node:path";

import { z } from "zod";

import type { PersistedConfig } from "../persisted-config.js";
import type { PaseoOpenAIConfig, PaseoSpeechConfig } from "../bootstrap.js";
import {
  LocalSttModelIdSchema,
  LocalTtsModelIdSchema,
} from "./providers/local/sherpa/model-catalog.js";
import {
  DEFAULT_LOCAL_STT_MODEL,
  DEFAULT_LOCAL_TTS_MODEL,
  DEFAULT_OPENAI_REALTIME_TRANSCRIPTION_MODEL,
  DEFAULT_OPENAI_TTS_MODEL,
} from "./speech-defaults.js";
import { SpeechProviderIdSchema } from "./speech-types.js";

const DEFAULT_LOCAL_MODELS_SUBDIR = path.join("models", "local-speech");

const OpenAiTtsVoiceSchema = z.enum([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);

const OpenAiTtsModelSchema = z.enum(["tts-1", "tts-1-hd"]);

const OptionalSpeechProviderSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}, SpeechProviderIdSchema.optional());

const OptionalBooleanFlagSchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return undefined;
}, z.boolean().optional());

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

const OptionalIntegerSchema = z.preprocess((value) => {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : undefined;
  }
  if (typeof value !== "string") {
    return value;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}, z.number().int().optional());

const OptionalTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const ResolvedSpeechConfigSchema = z
  .object({
    dictationSttProvider: OptionalSpeechProviderSchema.default("local"),
    voiceSttProvider: OptionalSpeechProviderSchema.default("local"),
    voiceTtsProvider: OptionalSpeechProviderSchema.default("local"),
    localModelsDir: z.string().trim().min(1),
    localAutoDownload: OptionalBooleanFlagSchema.default(true),
    dictationLocalSttModel: LocalSttModelIdSchema.default(DEFAULT_LOCAL_STT_MODEL),
    voiceLocalSttModel: LocalSttModelIdSchema.default(DEFAULT_LOCAL_STT_MODEL),
    voiceLocalTtsModel: LocalTtsModelIdSchema.default(DEFAULT_LOCAL_TTS_MODEL),
    voiceLocalTtsSpeakerId: OptionalIntegerSchema,
    voiceLocalTtsSpeed: OptionalFiniteNumberSchema,
    anyLocalRequested: z.boolean(),
    openaiApiKey: OptionalTrimmedStringSchema,
    openaiSttConfidenceThreshold: OptionalFiniteNumberSchema,
    openaiSttModel: OptionalTrimmedStringSchema,
    openaiTtsVoice: z.preprocess((value) => {
      if (typeof value !== "string") {
        return value;
      }
      const normalized = value.trim().toLowerCase();
      return normalized.length > 0 ? normalized : undefined;
    }, OpenAiTtsVoiceSchema.default("alloy")),
    openaiTtsModel: z.preprocess((value) => {
      if (typeof value !== "string") {
        return value;
      }
      const normalized = value.trim().toLowerCase();
      return normalized.length > 0 ? normalized : undefined;
    }, OpenAiTtsModelSchema.default(DEFAULT_OPENAI_TTS_MODEL)),
    openaiRealtimeTranscriptionModel: OptionalTrimmedStringSchema.default(
      DEFAULT_OPENAI_REALTIME_TRANSCRIPTION_MODEL
    ),
  })
  .transform((input): { openai: PaseoOpenAIConfig | undefined; speech: PaseoSpeechConfig } => {
    const openai = input.openaiApiKey
      ? {
          apiKey: input.openaiApiKey,
          stt: {
            apiKey: input.openaiApiKey,
            ...(input.openaiSttConfidenceThreshold !== undefined
              ? { confidenceThreshold: input.openaiSttConfidenceThreshold }
              : {}),
            ...(input.openaiSttModel
              ? { model: input.openaiSttModel }
              : {}),
          },
          tts: {
            apiKey: input.openaiApiKey,
            voice: input.openaiTtsVoice,
            model: input.openaiTtsModel,
            responseFormat: "pcm" as const,
          },
          realtimeTranscriptionModel: input.openaiRealtimeTranscriptionModel,
        }
      : undefined;

    return {
      openai,
      speech: {
        dictationSttProvider: input.dictationSttProvider,
        voiceSttProvider: input.voiceSttProvider,
        voiceTtsProvider: input.voiceTtsProvider,
        ...(input.anyLocalRequested
          ? {
              local: {
                modelsDir: input.localModelsDir,
                autoDownload: input.localAutoDownload,
              },
            }
          : {}),
        dictationLocalSttModel: input.dictationLocalSttModel,
        voiceLocalSttModel: input.voiceLocalSttModel,
        voiceLocalTtsModel: input.voiceLocalTtsModel,
        ...(input.voiceLocalTtsSpeakerId !== undefined
          ? { voiceLocalTtsSpeakerId: input.voiceLocalTtsSpeakerId }
          : {}),
        ...(input.voiceLocalTtsSpeed !== undefined
          ? { voiceLocalTtsSpeed: input.voiceLocalTtsSpeed }
          : {}),
      },
    };
  });

export function resolveSpeechConfig(params: {
  paseoHome: string;
  env: NodeJS.ProcessEnv;
  persisted: PersistedConfig;
}): {
  openai: PaseoOpenAIConfig | undefined;
  speech: PaseoSpeechConfig;
} {
  const { paseoHome, env, persisted } = params;

  const dictationSttProvider =
    env.PASEO_DICTATION_STT_PROVIDER
    ?? persisted.features?.dictation?.stt?.provider
    ?? "local";

  const voiceSttProvider =
    env.PASEO_VOICE_STT_PROVIDER
    ?? persisted.features?.voiceMode?.stt?.provider
    ?? "local";

  const voiceTtsProvider =
    env.PASEO_VOICE_TTS_PROVIDER
    ?? persisted.features?.voiceMode?.tts?.provider
    ?? "local";

  const anyLocalRequested =
    dictationSttProvider === "local" ||
    voiceSttProvider === "local" ||
    voiceTtsProvider === "local" ||
    env.PASEO_LOCAL_MODELS_DIR !== undefined ||
    persisted.providers?.local !== undefined;

  return ResolvedSpeechConfigSchema.parse({
    dictationSttProvider,
    voiceSttProvider,
    voiceTtsProvider,
    localModelsDir:
      env.PASEO_LOCAL_MODELS_DIR
      ?? persisted.providers?.local?.modelsDir
      ?? path.join(paseoHome, DEFAULT_LOCAL_MODELS_SUBDIR),
    localAutoDownload:
      env.PASEO_LOCAL_AUTO_DOWNLOAD
      ?? persisted.providers?.local?.autoDownload,
    dictationLocalSttModel:
      env.PASEO_DICTATION_LOCAL_STT_MODEL
      ?? persisted.features?.dictation?.stt?.model
      ?? DEFAULT_LOCAL_STT_MODEL,
    voiceLocalSttModel:
      env.PASEO_VOICE_LOCAL_STT_MODEL
      ?? persisted.features?.voiceMode?.stt?.model
      ?? DEFAULT_LOCAL_STT_MODEL,
    voiceLocalTtsModel:
      env.PASEO_VOICE_LOCAL_TTS_MODEL
      ?? persisted.features?.voiceMode?.tts?.model
      ?? DEFAULT_LOCAL_TTS_MODEL,
    voiceLocalTtsSpeakerId:
      env.PASEO_VOICE_LOCAL_TTS_SPEAKER_ID
      ?? persisted.features?.voiceMode?.tts?.speakerId,
    voiceLocalTtsSpeed:
      env.PASEO_VOICE_LOCAL_TTS_SPEED
      ?? persisted.features?.voiceMode?.tts?.speed,
    anyLocalRequested,
    openaiApiKey: env.OPENAI_API_KEY ?? persisted.providers?.openai?.apiKey,
    openaiSttConfidenceThreshold:
      env.STT_CONFIDENCE_THRESHOLD
      ?? persisted.features?.dictation?.stt?.confidenceThreshold,
    openaiSttModel:
      env.STT_MODEL
      ?? (voiceSttProvider === "openai"
        ? persisted.features?.voiceMode?.stt?.model
        : undefined)
      ?? (dictationSttProvider === "openai"
        ? persisted.features?.dictation?.stt?.model
        : undefined),
    openaiTtsVoice:
      env.TTS_VOICE
      ?? (voiceTtsProvider === "openai"
        ? persisted.features?.voiceMode?.tts?.voice
        : undefined)
      ?? "alloy",
    openaiTtsModel:
      env.TTS_MODEL
      ?? (voiceTtsProvider === "openai"
        ? persisted.features?.voiceMode?.tts?.model
        : undefined)
      ?? DEFAULT_OPENAI_TTS_MODEL,
    openaiRealtimeTranscriptionModel:
      env.OPENAI_REALTIME_TRANSCRIPTION_MODEL
      ?? (dictationSttProvider === "openai"
        ? persisted.features?.dictation?.stt?.model
        : undefined)
      ?? DEFAULT_OPENAI_REALTIME_TRANSCRIPTION_MODEL,
  });
}
