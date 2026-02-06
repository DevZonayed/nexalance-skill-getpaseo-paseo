import { z } from "zod";

import type { PersistedConfig } from "../persisted-config.js";
import type { PaseoOpenAIConfig, PaseoSpeechConfig } from "../bootstrap.js";
import { resolveLocalSpeechConfig } from "./providers/local/config.js";
import { resolveOpenAiSpeechConfig } from "./providers/openai/config.js";
import {
  SpeechProviderIdSchema,
  type RequestedSpeechProviders,
} from "./speech-types.js";

const OptionalSpeechProviderSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}, SpeechProviderIdSchema.optional());

const RequestedSpeechProvidersSchema = z.object({
  dictationSttProvider: OptionalSpeechProviderSchema.default("local"),
  voiceSttProvider: OptionalSpeechProviderSchema.default("local"),
  voiceTtsProvider: OptionalSpeechProviderSchema.default("local"),
});

function resolveRequestedSpeechProviders(params: {
  env: NodeJS.ProcessEnv;
  persisted: PersistedConfig;
}): RequestedSpeechProviders {
  return RequestedSpeechProvidersSchema.parse({
    dictationSttProvider:
      params.env.PASEO_DICTATION_STT_PROVIDER ??
      params.persisted.features?.dictation?.stt?.provider ??
      "local",
    voiceSttProvider:
      params.env.PASEO_VOICE_STT_PROVIDER ??
      params.persisted.features?.voiceMode?.stt?.provider ??
      "local",
    voiceTtsProvider:
      params.env.PASEO_VOICE_TTS_PROVIDER ??
      params.persisted.features?.voiceMode?.tts?.provider ??
      "local",
  });
}

export function resolveSpeechConfig(params: {
  paseoHome: string;
  env: NodeJS.ProcessEnv;
  persisted: PersistedConfig;
}): {
  openai: PaseoOpenAIConfig | undefined;
  speech: PaseoSpeechConfig;
} {
  const providers = resolveRequestedSpeechProviders({
    env: params.env,
    persisted: params.persisted,
  });

  const local = resolveLocalSpeechConfig({
    paseoHome: params.paseoHome,
    env: params.env,
    persisted: params.persisted,
    providers,
  });

  const openai = resolveOpenAiSpeechConfig({
    env: params.env,
    persisted: params.persisted,
    providers,
  });

  return {
    openai,
    speech: {
      dictationSttProvider: providers.dictationSttProvider,
      voiceSttProvider: providers.voiceSttProvider,
      voiceTtsProvider: providers.voiceTtsProvider,
      ...(local.local
        ? { local: local.local }
        : {}),
      dictationLocalSttModel: local.dictationLocalSttModel,
      voiceLocalSttModel: local.voiceLocalSttModel,
      voiceLocalTtsModel: local.voiceLocalTtsModel,
      ...(local.voiceLocalTtsSpeakerId !== undefined
        ? { voiceLocalTtsSpeakerId: local.voiceLocalTtsSpeakerId }
        : {}),
      ...(local.voiceLocalTtsSpeed !== undefined
        ? { voiceLocalTtsSpeed: local.voiceLocalTtsSpeed }
        : {}),
    },
  };
}
