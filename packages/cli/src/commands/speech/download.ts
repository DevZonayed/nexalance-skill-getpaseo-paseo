import type { Command } from "commander";
import type {
  CommandError,
  CommandOptions,
  ListResult,
  OutputSchema,
} from "../../output/index.js";
import { connectToDaemon } from "../../utils/client.js";

interface SpeechDownloadRow {
  modelId: string;
  status: "downloaded";
}

const speechDownloadSchema: OutputSchema<SpeechDownloadRow> = {
  idField: "modelId",
  columns: [
    { header: "MODEL", field: "modelId", width: 36 },
    { header: "STATUS", field: "status", width: 12, color: () => "green" },
  ],
};

export type SpeechDownloadResult = ListResult<SpeechDownloadRow>;

export interface SpeechDownloadOptions extends CommandOptions {
  host?: string;
  model?: string[];
}

export async function runSpeechDownloadCommand(
  options: SpeechDownloadOptions,
  _command: Command
): Promise<SpeechDownloadResult> {
  const client = await connectToDaemon({ host: options.host });
  try {
    const response = await client.downloadSpeechModels({
      modelIds: options.model && options.model.length > 0 ? options.model : undefined,
    });
    if (response.error) {
      const commandError: CommandError = {
        code: "SPEECH_MODELS_DOWNLOAD_FAILED",
        message: response.error,
      };
      throw commandError;
    }

    return {
      type: "list",
      data: response.downloadedModelIds.map((modelId) => ({
        modelId,
        status: "downloaded" as const,
      })),
      schema: speechDownloadSchema,
    };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && "message" in error) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    const commandError: CommandError = {
      code: "SPEECH_MODELS_DOWNLOAD_FAILED",
      message: `Failed to download speech models: ${message}`,
    };
    throw commandError;
  } finally {
    await client.close().catch(() => {});
  }
}
