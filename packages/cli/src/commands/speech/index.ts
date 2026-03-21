import { Command } from "commander";
import { withOutput } from "../../output/index.js";
import { runSpeechModelsCommand } from "./models.js";
import { runSpeechDownloadCommand } from "./download.js";
import { addJsonAndDaemonHostOptions, collectMultiple } from "../../utils/command-options.js";

export function createSpeechCommand(): Command {
  const speech = new Command("speech").description("Manage local speech models");

  addJsonAndDaemonHostOptions(
    speech.command("models").description("List local speech model download status"),
  ).action(withOutput(runSpeechModelsCommand));

  addJsonAndDaemonHostOptions(
    speech
      .command("download")
      .description("Download local speech models")
      .option("--model <id>", "Model ID to download (repeatable)", collectMultiple, []),
  ).action(withOutput(runSpeechDownloadCommand));

  return speech;
}
