import type pino from "pino";
import type { SpeechToTextProvider, TranscriptionResult } from "../speech/speech-provider.js";
import { maybePersistDebugAudio } from "./stt-debug.js";
import { parsePcm16MonoWav, parsePcmRateFromFormat } from "../speech/audio.js";
import { Pcm16MonoResampler } from "./pcm16-resampler.js";

interface TranscriptionMetadata {
  agentId?: string;
  requestId?: string;
  label?: string;
}

export interface SessionTranscriptionResult extends TranscriptionResult {
  debugRecordingPath?: string;
  byteLength: number;
  format: string;
}

/**
 * Per-session STT manager
 * Handles speech-to-text transcription
 */
export class STTManager {
  private readonly sessionId: string;
  private readonly logger: pino.Logger;
  private readonly stt: SpeechToTextProvider | null;

  constructor(sessionId: string, logger: pino.Logger, stt: SpeechToTextProvider | null) {
    this.sessionId = sessionId;
    this.logger = logger.child({ module: "agent", component: "stt-manager", sessionId });
    this.stt = stt;
  }

  /**
   * Transcribe audio buffer to text
   */
  public async transcribe(
    audio: Buffer,
    format: string,
    metadata?: TranscriptionMetadata
  ): Promise<SessionTranscriptionResult> {
    if (!this.stt) {
      throw new Error("STT not configured");
    }

    this.logger.debug(
      { bytes: audio.length, format, label: metadata?.label },
      "Transcribing audio"
    );

    let debugRecordingPath: string | null = null;
    try {
      debugRecordingPath = await maybePersistDebugAudio(
        audio,
        {
          sessionId: this.sessionId,
          agentId: metadata?.agentId,
          requestId: metadata?.requestId,
          label: metadata?.label,
          format,
        },
        this.logger
      );
    } catch (error) {
      this.logger.warn({ err: error }, "Failed to persist debug audio");
    }

    const session = this.stt.createSession({
      logger: this.logger.child({ component: "stt-session" }),
      language: "en",
    });

    let inputRate: number;
    let pcm16: Buffer;
    if (format.toLowerCase().includes("audio/wav")) {
      const parsed = parsePcm16MonoWav(audio);
      inputRate = parsed.sampleRate;
      pcm16 = parsed.pcm16;
    } else if (format.toLowerCase().includes("audio/pcm")) {
      inputRate =
        parsePcmRateFromFormat(format, session.requiredSampleRate) ??
        session.requiredSampleRate;
      pcm16 = audio;
    } else {
      throw new Error(`Unsupported audio format for STT: ${format}`);
    }

    let pcmForModel = pcm16;
    if (inputRate !== session.requiredSampleRate) {
      const resampler = new Pcm16MonoResampler({
        inputRate,
        outputRate: session.requiredSampleRate,
      });
      pcmForModel = resampler.processChunk(pcm16);
      inputRate = session.requiredSampleRate;
    }

    try {
      const startedAt = Date.now();
      const finalEventPromise = new Promise<{
        transcript: string;
        language?: string;
        logprobs?: TranscriptionResult["logprobs"];
        avgLogprob?: number;
        isLowConfidence?: boolean;
      }>((resolve, reject) => {
        session.on("error", reject);
        session.on("transcript", (payload) => {
          if (!payload.isFinal) {
            return;
          }
          resolve({
            transcript: payload.transcript,
            language: payload.language,
            logprobs: payload.logprobs,
            avgLogprob: payload.avgLogprob,
            isLowConfidence: payload.isLowConfidence,
          });
        });
      });

      await session.connect();
      session.appendPcm16(pcmForModel);
      session.commit();
      const finalEvent = await finalEventPromise;
      const result: TranscriptionResult = {
        text: finalEvent.transcript,
        language: finalEvent.language,
        logprobs: finalEvent.logprobs,
        avgLogprob: finalEvent.avgLogprob,
        isLowConfidence: finalEvent.isLowConfidence,
        duration: Date.now() - startedAt,
      };

      // Filter out low-confidence transcriptions (non-speech sounds)
      if (result.isLowConfidence) {
        this.logger.debug(
          { text: result.text, avgLogprob: result.avgLogprob },
          "Filtered low-confidence transcription (likely non-speech)"
        );

        // Return empty text to ignore this transcription
        return {
          ...result,
          text: "",
          byteLength: audio.length,
          format,
          debugRecordingPath: debugRecordingPath ?? undefined,
        };
      }

      this.logger.debug(
        { text: result.text, avgLogprob: result.avgLogprob },
        "Transcription complete"
      );

      return {
        ...result,
        debugRecordingPath: debugRecordingPath ?? undefined,
        byteLength: audio.length,
        format,
      };
    } finally {
      session.close();
    }
  }

  /**
   * Cleanup (currently no-op, but provides extension point)
   */
  public cleanup(): void {
    // No cleanup needed for STT currently
  }
}
