import { z } from "zod";

export type SherpaOnnxModelKind = "stt-online" | "stt-offline" | "tts";

export type SherpaOnnxModelId =
  | "zipformer-bilingual-zh-en-2023-02-20"
  | "paraformer-bilingual-zh-en"
  | "parakeet-tdt-0.6b-v3-int8"
  | "kitten-nano-en-v0_1-fp16"
  | "kokoro-en-v0_19"
  | "pocket-tts-onnx-int8";

export const LOCAL_STT_MODEL_IDS = [
  "zipformer-bilingual-zh-en-2023-02-20",
  "paraformer-bilingual-zh-en",
  "parakeet-tdt-0.6b-v3-int8",
] as const;
export type LocalSttModelId = (typeof LOCAL_STT_MODEL_IDS)[number];

export const LOCAL_TTS_MODEL_IDS = [
  "kitten-nano-en-v0_1-fp16",
  "kokoro-en-v0_19",
  "pocket-tts-onnx-int8",
] as const;
export type LocalTtsModelId = (typeof LOCAL_TTS_MODEL_IDS)[number];

const STT_MODEL_ALIASES: Record<string, (typeof LOCAL_STT_MODEL_IDS)[number]> = {
  zipformer: "zipformer-bilingual-zh-en-2023-02-20",
  "zipformer-bilingual": "zipformer-bilingual-zh-en-2023-02-20",
  paraformer: "paraformer-bilingual-zh-en",
  parakeet: "parakeet-tdt-0.6b-v3-int8",
  "parakeet-v3": "parakeet-tdt-0.6b-v3-int8",
  "parakeet-tdt": "parakeet-tdt-0.6b-v3-int8",
};

const TTS_MODEL_ALIASES: Record<string, (typeof LOCAL_TTS_MODEL_IDS)[number]> = {
  pocket: "pocket-tts-onnx-int8",
  "pocket-tts": "pocket-tts-onnx-int8",
  kitten: "kitten-nano-en-v0_1-fp16",
  kokoro: "kokoro-en-v0_19",
};

export const LocalSttModelIdSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return value;
  return STT_MODEL_ALIASES[normalized] ?? normalized;
}, z.enum(LOCAL_STT_MODEL_IDS));

export const LocalTtsModelIdSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return value;
  return TTS_MODEL_ALIASES[normalized] ?? normalized;
}, z.enum(LOCAL_TTS_MODEL_IDS));

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
  "zipformer-bilingual-zh-en-2023-02-20": {
    id: "zipformer-bilingual-zh-en-2023-02-20",
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
  "paraformer-bilingual-zh-en": {
    id: "paraformer-bilingual-zh-en",
    kind: "stt-online",
    archiveUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2",
    extractedDir: "sherpa-onnx-streaming-paraformer-bilingual-zh-en",
    requiredFiles: ["encoder.int8.onnx", "decoder.int8.onnx", "tokens.txt"],
    description: "Streaming Paraformer (often strong accuracy; heavier).",
  },
  "parakeet-tdt-0.6b-v3-int8": {
    id: "parakeet-tdt-0.6b-v3-int8",
    kind: "stt-offline",
    archiveUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
    extractedDir: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
    requiredFiles: ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"],
    description: "NVIDIA Parakeet TDT v3 (offline NeMo transducer, multilingual).",
  },
  "kitten-nano-en-v0_1-fp16": {
    id: "kitten-nano-en-v0_1-fp16",
    kind: "tts",
    archiveUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kitten-nano-en-v0_1-fp16.tar.bz2",
    extractedDir: "kitten-nano-en-v0_1-fp16",
    requiredFiles: ["model.fp16.onnx", "voices.bin", "tokens.txt", "espeak-ng-data"],
    description: "KittenTTS (small, fast English TTS).",
  },
  "kokoro-en-v0_19": {
    id: "kokoro-en-v0_19",
    kind: "tts",
    archiveUrl: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2",
    extractedDir: "kokoro-en-v0_19",
    requiredFiles: ["model.onnx", "voices.bin", "tokens.txt", "espeak-ng-data"],
    description: "Kokoro TTS (higher quality; larger).",
  },
  "pocket-tts-onnx-int8": {
    id: "pocket-tts-onnx-int8",
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
