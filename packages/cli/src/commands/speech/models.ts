import type { Command } from "commander";
import type {
  CommandError,
  CommandOptions,
  ListResult,
  OutputSchema,
} from "../../output/index.js";
import { connectToDaemon } from "../../utils/client.js";

interface SpeechModelListItem {
  id: string;
  kind: string;
  status: "downloaded" | "missing";
  modelDir: string;
  missingFiles: string;
}

const speechModelsSchema: OutputSchema<SpeechModelListItem> = {
  idField: "id",
  columns: [
    { header: "MODEL", field: "id", width: 36 },
    { header: "KIND", field: "kind", width: 12 },
    {
      header: "STATUS",
      field: "status",
      width: 12,
      color: (value) => (value === "downloaded" ? "green" : "yellow"),
    },
    { header: "MODEL DIR", field: "modelDir", width: 44 },
    { header: "MISSING FILES", field: "missingFiles", width: 40 },
  ],
};

export type SpeechModelsResult = ListResult<SpeechModelListItem>;

export interface SpeechModelsOptions extends CommandOptions {
  host?: string;
}

export async function runSpeechModelsCommand(
  options: SpeechModelsOptions,
  _command: Command
): Promise<SpeechModelsResult> {
  const client = await connectToDaemon({ host: options.host });
  try {
    const response = await client.listSpeechModels();
    const rows: SpeechModelListItem[] = response.models
      .slice()
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
      .map((model) => ({
        id: model.id,
        kind: model.kind,
        status: model.isDownloaded ? "downloaded" : "missing",
        modelDir: model.modelDir,
        missingFiles: model.missingFiles?.join(", ") ?? "",
      }));
    return {
      type: "list",
      data: rows,
      schema: speechModelsSchema,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const commandError: CommandError = {
      code: "SPEECH_MODELS_LIST_FAILED",
      message: `Failed to list speech models: ${message}`,
    };
    throw commandError;
  } finally {
    await client.close().catch(() => {});
  }
}
