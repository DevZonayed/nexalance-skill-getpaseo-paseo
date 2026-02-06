import { z } from "zod";

export type SherpaOnnxModelKind = "stt-online" | "stt-offline" | "tts";

const MODEL_IDS = {
  ZIPFORMER_BILINGUAL_ZH_EN_2023_02_20: "zipformer-bilingual-zh-en-2023-02-20",
  PARAFORMER_BILINGUAL_ZH_EN: "paraformer-bilingual-zh-en",
  PARAKEET_TDT_0_6B_V3_INT8: "parakeet-tdt-0.6b-v3-int8",
  KITTEN_NANO_EN_V0_1_FP16: "kitten-nano-en-v0_1-fp16",
  KOKORO_EN_V0_19: "kokoro-en-v0_19",
  POCKET_TTS_ONNX_INT8: "pocket-tts-onnx-int8",
} as const;

export type SherpaOnnxModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

export const LOCAL_STT_MODEL_IDS = [
  MODEL_IDS.ZIPFORMER_BILINGUAL_ZH_EN_2023_02_20,
  MODEL_IDS.PARAFORMER_BILINGUAL_ZH_EN,
  MODEL_IDS.PARAKEET_TDT_0_6B_V3_INT8,
] as const;
export type LocalSttModelId = (typeof LOCAL_STT_MODEL_IDS)[number];

export const LOCAL_TTS_MODEL_IDS = [
  MODEL_IDS.KITTEN_NANO_EN_V0_1_FP16,
  MODEL_IDS.KOKORO_EN_V0_19,
  MODEL_IDS.POCKET_TTS_ONNX_INT8,
] as const;
export type LocalTtsModelId = (typeof LOCAL_TTS_MODEL_IDS)[number];

export const DEFAULT_LOCAL_STT_MODEL: LocalSttModelId = MODEL_IDS.PARAKEET_TDT_0_6B_V3_INT8;
export const DEFAULT_LOCAL_TTS_MODEL: LocalTtsModelId = MODEL_IDS.POCKET_TTS_ONNX_INT8;

const STT_MODEL_ALIASES: Record<string, LocalSttModelId> = {
  zipformer: MODEL_IDS.ZIPFORMER_BILINGUAL_ZH_EN_2023_02_20,
  "zipformer-bilingual": MODEL_IDS.ZIPFORMER_BILINGUAL_ZH_EN_2023_02_20,
  paraformer: MODEL_IDS.PARAFORMER_BILINGUAL_ZH_EN,
  parakeet: MODEL_IDS.PARAKEET_TDT_0_6B_V3_INT8,
  "parakeet-v3": MODEL_IDS.PARAKEET_TDT_0_6B_V3_INT8,
  "parakeet-tdt": MODEL_IDS.PARAKEET_TDT_0_6B_V3_INT8,
};

const TTS_MODEL_ALIASES: Record<string, LocalTtsModelId> = {
  pocket: MODEL_IDS.POCKET_TTS_ONNX_INT8,
  "pocket-tts": MODEL_IDS.POCKET_TTS_ONNX_INT8,
  kitten: MODEL_IDS.KITTEN_NANO_EN_V0_1_FP16,
  kokoro: MODEL_IDS.KOKORO_EN_V0_19,
};

function createAliasedModelIdSchema<T extends readonly [string, ...string[]]>(
  values: T,
  aliases: Record<string, T[number]>
) {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return value;
    }
    return aliases[normalized] ?? normalized;
  }, z.enum(values));
}

export const LocalSttModelIdSchema = createAliasedModelIdSchema(
  LOCAL_STT_MODEL_IDS,
  STT_MODEL_ALIASES
);

export const LocalTtsModelIdSchema = createAliasedModelIdSchema(
  LOCAL_TTS_MODEL_IDS,
  TTS_MODEL_ALIASES
);

export type SherpaOnnxModelSpec = {
  id: SherpaOnnxModelId;
  kind: SherpaOnnxModelKind;
  archiveUrl?: string;
  downloadFiles?: Array<{ url: string; relPath: string }>;
  extractedDir: string;
  requiredFiles: string[];
  description: string;
};

export const SHERPA_ONNX_MODEL_CATALOG: Record<SherpaOnnxModelId, SherpaOnnxModelSpec> = {
  [MODEL_IDS.ZIPFORMER_BILINGUAL_ZH_EN_2023_02_20]: {
    id: MODEL_IDS.ZIPFORMER_BILINGUAL_ZH_EN_2023_02_20,
    kind: "stt-online",
    archiveUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2",
    extractedDir: "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20",
    requiredFiles: [
      "encoder-epoch-99-avg-1.onnx",
      "decoder-epoch-99-avg-1.onnx",
      "joiner-epoch-99-avg-1.onnx",
      "tokens.txt",
    ],
    description: "Streaming Zipformer transducer (fast, good accuracy).",
  },
  [MODEL_IDS.PARAFORMER_BILINGUAL_ZH_EN]: {
    id: MODEL_IDS.PARAFORMER_BILINGUAL_ZH_EN,
    kind: "stt-online",
    archiveUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2",
    extractedDir: "sherpa-onnx-streaming-paraformer-bilingual-zh-en",
    requiredFiles: ["encoder.int8.onnx", "decoder.int8.onnx", "tokens.txt"],
    description: "Streaming Paraformer (often strong accuracy; heavier).",
  },
  [MODEL_IDS.PARAKEET_TDT_0_6B_V3_INT8]: {
    id: MODEL_IDS.PARAKEET_TDT_0_6B_V3_INT8,
    kind: "stt-offline",
    archiveUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
    extractedDir: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
    requiredFiles: ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"],
    description: "NVIDIA Parakeet TDT v3 (offline NeMo transducer, multilingual).",
  },
  [MODEL_IDS.KITTEN_NANO_EN_V0_1_FP16]: {
    id: MODEL_IDS.KITTEN_NANO_EN_V0_1_FP16,
    kind: "tts",
    archiveUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kitten-nano-en-v0_1-fp16.tar.bz2",
    extractedDir: "kitten-nano-en-v0_1-fp16",
    requiredFiles: ["model.fp16.onnx", "voices.bin", "tokens.txt", "espeak-ng-data"],
    description: "KittenTTS (small, fast English TTS).",
  },
  [MODEL_IDS.KOKORO_EN_V0_19]: {
    id: MODEL_IDS.KOKORO_EN_V0_19,
    kind: "tts",
    archiveUrl: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2",
    extractedDir: "kokoro-en-v0_19",
    requiredFiles: ["model.onnx", "voices.bin", "tokens.txt", "espeak-ng-data"],
    description: "Kokoro TTS (higher quality; larger).",
  },
  [MODEL_IDS.POCKET_TTS_ONNX_INT8]: {
    id: MODEL_IDS.POCKET_TTS_ONNX_INT8,
    kind: "tts",
    extractedDir: "pocket-tts-onnx-int8",
    downloadFiles: [
      {
        url: "https://huggingface.co/KevinAHM/pocket-tts-onnx/resolve/main/onnx/mimi_encoder.onnx",
        relPath: "onnx/mimi_encoder.onnx",
      },
      {
        url: "https://huggingface.co/KevinAHM/pocket-tts-onnx/resolve/main/onnx/text_conditioner.onnx",
        relPath: "onnx/text_conditioner.onnx",
      },
      {
        url: "https://huggingface.co/KevinAHM/pocket-tts-onnx/resolve/main/onnx/flow_lm_main_int8.onnx",
        relPath: "onnx/flow_lm_main_int8.onnx",
      },
      {
        url: "https://huggingface.co/KevinAHM/pocket-tts-onnx/resolve/main/onnx/flow_lm_flow_int8.onnx",
        relPath: "onnx/flow_lm_flow_int8.onnx",
      },
      {
        url: "https://huggingface.co/KevinAHM/pocket-tts-onnx/resolve/main/onnx/mimi_decoder_int8.onnx",
        relPath: "onnx/mimi_decoder_int8.onnx",
      },
      {
        url: "https://huggingface.co/KevinAHM/pocket-tts-onnx/resolve/main/tokenizer.model",
        relPath: "tokenizer.model",
      },
      {
        url: "https://huggingface.co/KevinAHM/pocket-tts-onnx/resolve/main/reference_sample.wav",
        relPath: "reference_sample.wav",
      },
    ],
    requiredFiles: [
      "onnx/mimi_encoder.onnx",
      "onnx/text_conditioner.onnx",
      "onnx/flow_lm_main_int8.onnx",
      "onnx/flow_lm_flow_int8.onnx",
      "onnx/mimi_decoder_int8.onnx",
      "tokenizer.model",
      "reference_sample.wav",
    ],
    description: "Pocket TTS ONNX (INT8) with streaming decode support (via onnxruntime).",
  },
};

export function listSherpaOnnxModels(): SherpaOnnxModelSpec[] {
  return Object.values(SHERPA_ONNX_MODEL_CATALOG);
}

export function getSherpaOnnxModelSpec(id: SherpaOnnxModelId): SherpaOnnxModelSpec {
  const spec = SHERPA_ONNX_MODEL_CATALOG[id];
  if (!spec) {
    throw new Error(`Unknown sherpa-onnx model id: ${id}`);
  }
  return spec;
}
