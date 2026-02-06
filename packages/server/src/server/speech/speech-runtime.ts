import type { Logger } from "pino";

import type { PaseoOpenAIConfig, PaseoSpeechConfig } from "../bootstrap.js";
import {
  OpenAISTT,
} from "./providers/openai/stt.js";
import {
  OpenAITTS,
} from "./providers/openai/tts.js";
import { OpenAIRealtimeTranscriptionSession } from "./providers/openai/realtime-transcription-session.js";
import type { SpeechToTextProvider, TextToSpeechProvider } from "./speech-provider.js";
import { SherpaOnlineRecognizerEngine } from "./providers/local/sherpa/sherpa-online-recognizer.js";
import { SherpaOfflineRecognizerEngine } from "./providers/local/sherpa/sherpa-offline-recognizer.js";
import { SherpaOnnxSTT } from "./providers/local/sherpa/sherpa-stt.js";
import { SherpaOnnxParakeetSTT } from "./providers/local/sherpa/sherpa-parakeet-stt.js";
import { SherpaOnnxTTS } from "./providers/local/sherpa/sherpa-tts.js";
import { SherpaRealtimeTranscriptionSession } from "./providers/local/sherpa/sherpa-realtime-session.js";
import { SherpaParakeetRealtimeTranscriptionSession } from "./providers/local/sherpa/sherpa-parakeet-realtime-session.js";
import { ensureSherpaOnnxModels, getSherpaOnnxModelDir } from "./providers/local/sherpa/model-downloader.js";
import {
  LocalSttModelIdSchema,
  LocalTtsModelIdSchema,
  type LocalSttModelId,
  type LocalTtsModelId,
  type SherpaOnnxModelId,
} from "./providers/local/sherpa/model-catalog.js";
import { PocketTtsOnnxTTS } from "./providers/local/pocket/pocket-tts-onnx.js";
import {
  DEFAULT_LOCAL_STT_MODEL,
  DEFAULT_LOCAL_TTS_MODEL,
  DEFAULT_OPENAI_REALTIME_TRANSCRIPTION_MODEL,
  DEFAULT_OPENAI_TTS_MODEL,
} from "./speech-defaults.js";
import type { SpeechProviderId } from "./speech-types.js";

type LocalSttEngine =
  | { kind: "offline"; engine: SherpaOfflineRecognizerEngine }
  | { kind: "online"; engine: SherpaOnlineRecognizerEngine };

type RequestedSpeechProviders = {
  dictationSttProvider: SpeechProviderId;
  voiceSttProvider: SpeechProviderId;
  voiceTtsProvider: SpeechProviderId;
};

type ResolvedLocalModels = {
  dictationLocalSttModel: LocalSttModelId;
  voiceLocalSttModel: LocalSttModelId;
  voiceLocalTtsModel: LocalTtsModelId;
};

type OpenAiCredentialState = {
  openaiSttApiKey: string | undefined;
  openaiTtsApiKey: string | undefined;
  openaiDictationApiKey: string | undefined;
};

type InitializedLocalSpeech = {
  sttService: SpeechToTextProvider | null;
  ttsService: TextToSpeechProvider | null;
  dictationSttService: SpeechToTextProvider | null;
  localVoiceTtsProvider: TextToSpeechProvider | null;
  localSttEngines: Map<LocalSttModelId, LocalSttEngine>;
  requiredLocalModelIds: SherpaOnnxModelId[];
};

function buildModelDownloadHint(modelId: SherpaOnnxModelId): string {
  return `Use 'paseo speech download --model ${modelId}' to download this model.`;
}

function resolveRequestedSpeechProviders(
  speechConfig: PaseoSpeechConfig | null
): RequestedSpeechProviders {
  return {
    dictationSttProvider: speechConfig?.dictationSttProvider ?? "local",
    voiceSttProvider: speechConfig?.voiceSttProvider ?? "local",
    voiceTtsProvider: speechConfig?.voiceTtsProvider ?? "local",
  };
}

function resolveConfiguredLocalModels(
  speechConfig: PaseoSpeechConfig | null
): ResolvedLocalModels {
  return {
    dictationLocalSttModel: LocalSttModelIdSchema.parse(
      speechConfig?.dictationLocalSttModel ?? DEFAULT_LOCAL_STT_MODEL
    ),
    voiceLocalSttModel: LocalSttModelIdSchema.parse(
      speechConfig?.voiceLocalSttModel ?? DEFAULT_LOCAL_STT_MODEL
    ),
    voiceLocalTtsModel: LocalTtsModelIdSchema.parse(
      speechConfig?.voiceLocalTtsModel ?? DEFAULT_LOCAL_TTS_MODEL
    ),
  };
}

function computeRequiredLocalModelIds(params: {
  providers: RequestedSpeechProviders;
  models: {
    dictationLocalSttModel: SherpaOnnxModelId;
    voiceLocalSttModel: SherpaOnnxModelId;
    voiceLocalTtsModel: SherpaOnnxModelId;
  };
}): SherpaOnnxModelId[] {
  const ids = new Set<SherpaOnnxModelId>();
  if (params.providers.dictationSttProvider === "local") {
    ids.add(params.models.dictationLocalSttModel);
  }
  if (params.providers.voiceSttProvider === "local") {
    ids.add(params.models.voiceLocalSttModel);
  }
  if (params.providers.voiceTtsProvider === "local") {
    ids.add(params.models.voiceLocalTtsModel);
  }
  return Array.from(ids);
}

function resolveOpenAiCredentials(openaiConfig?: PaseoOpenAIConfig): OpenAiCredentialState {
  const openaiApiKey = openaiConfig?.apiKey;
  return {
    openaiSttApiKey: openaiConfig?.stt?.apiKey ?? openaiApiKey,
    openaiTtsApiKey: openaiConfig?.tts?.apiKey ?? openaiApiKey,
    openaiDictationApiKey: openaiApiKey,
  };
}

function validateOpenAiCredentialRequirements(params: {
  providers: RequestedSpeechProviders;
  openAiCredentials: OpenAiCredentialState;
  logger: Logger;
}): void {
  const { providers, openAiCredentials, logger } = params;
  const missingOpenAiCredentialsFor: string[] = [];
  if (providers.voiceSttProvider === "openai" && !openAiCredentials.openaiSttApiKey) {
    missingOpenAiCredentialsFor.push("voice.stt");
  }
  if (providers.voiceTtsProvider === "openai" && !openAiCredentials.openaiTtsApiKey) {
    missingOpenAiCredentialsFor.push("voice.tts");
  }
  if (providers.dictationSttProvider === "openai" && !openAiCredentials.openaiDictationApiKey) {
    missingOpenAiCredentialsFor.push("dictation.stt");
  }

  if (missingOpenAiCredentialsFor.length > 0) {
    logger.error(
      {
        requestedProviders: {
          dictationStt: providers.dictationSttProvider,
          voiceStt: providers.voiceSttProvider,
          voiceTts: providers.voiceTtsProvider,
        },
        missingOpenAiCredentialsFor,
      },
      "Invalid speech configuration: OpenAI provider selected but credentials are missing"
    );
    throw new Error(
      `Missing OpenAI credentials for configured speech features: ${missingOpenAiCredentialsFor.join(", ")}`
    );
  }
}

async function createLocalSttEngine(params: {
  modelId: LocalSttModelId;
  modelsDir: string;
  logger: Logger;
}): Promise<LocalSttEngine> {
  const { modelId, modelsDir, logger } = params;

  if (modelId === "parakeet-tdt-0.6b-v3-int8") {
    const modelDir = getSherpaOnnxModelDir(modelsDir, modelId);
    return {
      kind: "offline",
      engine: new SherpaOfflineRecognizerEngine(
        {
          model: {
            kind: "nemo_transducer",
            encoder: `${modelDir}/encoder.int8.onnx`,
            decoder: `${modelDir}/decoder.int8.onnx`,
            joiner: `${modelDir}/joiner.int8.onnx`,
            tokens: `${modelDir}/tokens.txt`,
          },
          numThreads: 2,
          debug: 0,
        },
        logger
      ),
    };
  }

  if (modelId === "paraformer-bilingual-zh-en") {
    const modelDir = getSherpaOnnxModelDir(modelsDir, modelId);
    return {
      kind: "online",
      engine: new SherpaOnlineRecognizerEngine(
        {
          model: {
            kind: "paraformer",
            encoder: `${modelDir}/encoder.int8.onnx`,
            decoder: `${modelDir}/decoder.int8.onnx`,
            tokens: `${modelDir}/tokens.txt`,
          },
          numThreads: 1,
          debug: 0,
        },
        logger
      ),
    };
  }

  if (modelId === "zipformer-bilingual-zh-en-2023-02-20") {
    const modelDir = getSherpaOnnxModelDir(modelsDir, modelId);
    return {
      kind: "online",
      engine: new SherpaOnlineRecognizerEngine(
        {
          model: {
            kind: "transducer",
            encoder: `${modelDir}/encoder-epoch-99-avg-1.onnx`,
            decoder: `${modelDir}/decoder-epoch-99-avg-1.onnx`,
            joiner: `${modelDir}/joiner-epoch-99-avg-1.onnx`,
            tokens: `${modelDir}/tokens.txt`,
            modelType: "zipformer",
          },
          numThreads: 1,
          debug: 0,
        },
        logger
      ),
    };
  }

  throw new Error(`Unsupported local STT model '${modelId}'`);
}

async function initializeLocalSpeechServices(params: {
  providers: RequestedSpeechProviders;
  localConfig: NonNullable<PaseoSpeechConfig["local"]> | null;
  localModels: ResolvedLocalModels;
  speechConfig: PaseoSpeechConfig | null;
  logger: Logger;
}): Promise<InitializedLocalSpeech> {
  const { providers, localConfig, localModels, speechConfig, logger } = params;

  const sttServices = {
    sttService: null as SpeechToTextProvider | null,
    ttsService: null as TextToSpeechProvider | null,
    dictationSttService: null as SpeechToTextProvider | null,
  };

  const localSttEngines = new Map<LocalSttModelId, LocalSttEngine>();
  let localVoiceTtsProvider: TextToSpeechProvider | null = null;

  const requiredLocalModelIds = computeRequiredLocalModelIds({
    providers,
    models: localModels,
  });

  if (requiredLocalModelIds.length > 0 && localConfig) {
    try {
      logger.info(
        {
          modelsDir: localConfig.modelsDir,
          modelIds: requiredLocalModelIds,
          autoDownload: localConfig.autoDownload ?? true,
        },
        "Ensuring local speech models"
      );
      await ensureSherpaOnnxModels({
        modelsDir: localConfig.modelsDir,
        modelIds: requiredLocalModelIds,
        autoDownload: localConfig.autoDownload ?? true,
        logger,
      });
    } catch (err) {
      logger.error(
        {
          err,
          modelsDir: localConfig.modelsDir,
          modelIds: requiredLocalModelIds,
          autoDownload: localConfig.autoDownload ?? true,
          hint:
            "Use `paseo speech models` to inspect status and " +
            "`paseo speech download --model <MODEL_ID>` to fetch missing models.",
        },
        "Failed to ensure local speech models"
      );
    }
  }

  const getLocalSttEngine = async (
    modelId: LocalSttModelId
  ): Promise<LocalSttEngine | null> => {
    const existing = localSttEngines.get(modelId);
    if (existing) {
      return existing;
    }
    if (!localConfig) {
      return null;
    }
    try {
      const created = await createLocalSttEngine({
        modelId,
        modelsDir: localConfig.modelsDir,
        logger,
      });
      localSttEngines.set(modelId, created);
      return created;
    } catch (err) {
      logger.error(
        {
          err,
          modelsDir: localConfig.modelsDir,
          modelId,
          hint: buildModelDownloadHint(modelId),
        },
        "Failed to initialize local STT engine (models missing or invalid)"
      );
      return null;
    }
  };

  if (providers.voiceSttProvider === "local") {
    if (!localConfig) {
      logger.warn(
        { configured: false },
        "Local STT selected for voice but local provider config is missing; STT will be unavailable"
      );
    } else {
      const voiceEngine = await getLocalSttEngine(localModels.voiceLocalSttModel);
      if (voiceEngine?.kind === "offline") {
        sttServices.sttService = new SherpaOnnxParakeetSTT({ engine: voiceEngine.engine }, logger);
      } else if (voiceEngine?.kind === "online") {
        sttServices.sttService = new SherpaOnnxSTT({ engine: voiceEngine.engine }, logger);
      }
    }
  }

  if (providers.dictationSttProvider === "local") {
    if (!localConfig) {
      logger.warn(
        { configured: false },
        "Local STT selected for dictation but local provider config is missing; dictation STT will be unavailable"
      );
    } else {
      const dictationEngine = await getLocalSttEngine(localModels.dictationLocalSttModel);
      if (dictationEngine?.kind === "offline") {
        sttServices.dictationSttService = {
          id: "local",
          createSession: () =>
            new SherpaParakeetRealtimeTranscriptionSession({ engine: dictationEngine.engine }),
        };
      } else if (dictationEngine?.kind === "online") {
        sttServices.dictationSttService = {
          id: "local",
          createSession: () => new SherpaRealtimeTranscriptionSession({ engine: dictationEngine.engine }),
        };
      }
    }
  }

  if (providers.voiceTtsProvider === "local") {
    if (!localConfig) {
      logger.warn(
        { configured: false },
        "Local TTS selected for voice but local provider config is missing; TTS will be unavailable"
      );
    } else {
      try {
        if (localModels.voiceLocalTtsModel === "pocket-tts-onnx-int8") {
          const modelDir = getSherpaOnnxModelDir(localConfig.modelsDir, localModels.voiceLocalTtsModel);
          localVoiceTtsProvider = await PocketTtsOnnxTTS.create(
            {
              modelDir,
              precision: "int8",
              targetChunkMs: 50,
            },
            logger
          );
        } else {
          const modelDir = getSherpaOnnxModelDir(localConfig.modelsDir, localModels.voiceLocalTtsModel);
          localVoiceTtsProvider = new SherpaOnnxTTS(
            {
              preset: localModels.voiceLocalTtsModel,
              modelDir,
              speakerId: speechConfig?.voiceLocalTtsSpeakerId,
              speed: speechConfig?.voiceLocalTtsSpeed,
            },
            logger
          );
        }
        sttServices.ttsService = localVoiceTtsProvider;
      } catch (err) {
        logger.error(
          {
            err,
            modelsDir: localConfig.modelsDir,
            modelId: localModels.voiceLocalTtsModel,
            hint: buildModelDownloadHint(localModels.voiceLocalTtsModel),
          },
          "Failed to initialize local TTS engine (models missing or invalid)"
        );
      }
    }
  }

  return {
    ...sttServices,
    localVoiceTtsProvider,
    localSttEngines,
    requiredLocalModelIds,
  };
}

function initializeOpenAiSpeechServices(params: {
  providers: RequestedSpeechProviders;
  openaiConfig?: PaseoOpenAIConfig;
  openAiCredentials: OpenAiCredentialState;
  existing: {
    sttService: SpeechToTextProvider | null;
    ttsService: TextToSpeechProvider | null;
    dictationSttService: SpeechToTextProvider | null;
  };
  logger: Logger;
}): {
  sttService: SpeechToTextProvider | null;
  ttsService: TextToSpeechProvider | null;
  dictationSttService: SpeechToTextProvider | null;
} {
  const { providers, openaiConfig, openAiCredentials, existing, logger } = params;

  let sttService = existing.sttService;
  let ttsService = existing.ttsService;
  let dictationSttService = existing.dictationSttService;

  const needsOpenAiStt = !sttService && providers.voiceSttProvider === "openai";
  const needsOpenAiTts = !ttsService && providers.voiceTtsProvider === "openai";
  const needsOpenAiDictation = !dictationSttService && providers.dictationSttProvider === "openai";

  if (
    (needsOpenAiStt || needsOpenAiTts || needsOpenAiDictation) &&
    (openAiCredentials.openaiSttApiKey ||
      openAiCredentials.openaiTtsApiKey ||
      openAiCredentials.openaiDictationApiKey)
  ) {
    logger.info("OpenAI speech provider initialized");

    if (needsOpenAiStt && openAiCredentials.openaiSttApiKey) {
      const { apiKey: _sttApiKey, ...sttConfig } = openaiConfig?.stt ?? {};
      sttService = new OpenAISTT(
        {
          apiKey: openAiCredentials.openaiSttApiKey,
          ...sttConfig,
        },
        logger
      );
    }

    if (needsOpenAiTts && openAiCredentials.openaiTtsApiKey) {
      const { apiKey: _ttsApiKey, ...ttsConfig } = openaiConfig?.tts ?? {};
      ttsService = new OpenAITTS(
        {
          apiKey: openAiCredentials.openaiTtsApiKey,
          voice: "alloy",
          model: DEFAULT_OPENAI_TTS_MODEL,
          responseFormat: "pcm",
          ...ttsConfig,
        },
        logger
      );
    }

    const dictationApiKey = openAiCredentials.openaiDictationApiKey;
    if (needsOpenAiDictation && dictationApiKey) {
      dictationSttService = {
        id: "openai",
        createSession: ({ logger: sessionLogger, language, prompt }) =>
          new OpenAIRealtimeTranscriptionSession({
            apiKey: dictationApiKey,
            logger: sessionLogger,
            transcriptionModel:
              openaiConfig?.realtimeTranscriptionModel
              ?? DEFAULT_OPENAI_REALTIME_TRANSCRIPTION_MODEL,
            ...(language ? { language } : {}),
            ...(prompt ? { prompt } : {}),
            turnDetection: null,
          }),
      };
    }
  } else if (needsOpenAiStt || needsOpenAiTts || needsOpenAiDictation) {
    logger.warn("OpenAI speech providers are configured but credentials are missing");
  }

  return {
    sttService,
    ttsService,
    dictationSttService,
  };
}

export type InitializedSpeechRuntime = {
  sttService: SpeechToTextProvider | null;
  ttsService: TextToSpeechProvider | null;
  dictationSttService: SpeechToTextProvider | null;
  cleanup: () => void;
  localModelConfig: {
    modelsDir: string;
    defaultModelIds: SherpaOnnxModelId[];
  } | null;
};

export async function initializeSpeechRuntime(params: {
  logger: Logger;
  openaiConfig?: PaseoOpenAIConfig;
  speechConfig?: PaseoSpeechConfig;
}): Promise<InitializedSpeechRuntime> {
  const logger = params.logger;
  const speechConfig = params.speechConfig ?? null;
  const localConfig = speechConfig?.local ?? null;
  const openaiConfig = params.openaiConfig;

  const providers = resolveRequestedSpeechProviders(speechConfig);
  const localModels = resolveConfiguredLocalModels(speechConfig);
  const openAiCredentials = resolveOpenAiCredentials(openaiConfig);

  validateOpenAiCredentialRequirements({
    providers,
    openAiCredentials,
    logger,
  });

  logger.info(
    {
      requestedProviders: {
        dictationStt: providers.dictationSttProvider,
        voiceStt: providers.voiceSttProvider,
        voiceTts: providers.voiceTtsProvider,
      },
      availability: {
        openai: {
          stt: Boolean(openAiCredentials.openaiSttApiKey),
          tts: Boolean(openAiCredentials.openaiTtsApiKey),
          dictationStt: Boolean(openAiCredentials.openaiDictationApiKey),
        },
        local: {
          configured: Boolean(localConfig),
          modelsDir: localConfig?.modelsDir ?? null,
          autoDownload: localConfig?.autoDownload ?? null,
        },
      },
    },
    "Speech provider reconciliation started"
  );

  const localSpeech = await initializeLocalSpeechServices({
    providers,
    localConfig,
    localModels,
    speechConfig,
    logger,
  });

  const openAiSpeech = initializeOpenAiSpeechServices({
    providers,
    openaiConfig,
    openAiCredentials,
    existing: {
      sttService: localSpeech.sttService,
      ttsService: localSpeech.ttsService,
      dictationSttService: localSpeech.dictationSttService,
    },
    logger,
  });

  const effectiveProviders = {
    dictationStt: openAiSpeech.dictationSttService?.id ?? "unavailable",
    voiceStt: openAiSpeech.sttService?.id ?? "unavailable",
    voiceTts:
      !openAiSpeech.ttsService
        ? "unavailable"
        : openAiSpeech.ttsService === localSpeech.localVoiceTtsProvider
          ? "local"
          : "openai",
  };
  const unavailableFeatures = [
    !openAiSpeech.dictationSttService ? "dictation.stt" : null,
    !openAiSpeech.sttService ? "voice.stt" : null,
    !openAiSpeech.ttsService ? "voice.tts" : null,
  ].filter((feature): feature is string => feature !== null);

  if (unavailableFeatures.length > 0) {
    logger.error(
      {
        requestedProviders: {
          dictationStt: providers.dictationSttProvider,
          voiceStt: providers.voiceSttProvider,
          voiceTts: providers.voiceTtsProvider,
        },
        effectiveProviders,
        unavailableFeatures,
      },
      "Speech provider reconciliation failed: configured features are unavailable"
    );
    throw new Error(`Configured speech features unavailable: ${unavailableFeatures.join(", ")}`);
  }

  logger.info(
    {
      effectiveProviders,
    },
    "Speech provider reconciliation completed"
  );

  const cleanup = () => {
    const maybeFreeable = localSpeech.localVoiceTtsProvider as unknown as { free?: () => void } | null;
    if (typeof maybeFreeable?.free === "function") {
      maybeFreeable.free();
    }
    for (const engine of localSpeech.localSttEngines.values()) {
      engine.engine.free();
    }
  };

  return {
    sttService: openAiSpeech.sttService,
    ttsService: openAiSpeech.ttsService,
    dictationSttService: openAiSpeech.dictationSttService,
    cleanup,
    localModelConfig:
      localConfig
        ? {
            modelsDir: localConfig.modelsDir,
            defaultModelIds: localSpeech.requiredLocalModelIds,
          }
        : null,
  };
}
