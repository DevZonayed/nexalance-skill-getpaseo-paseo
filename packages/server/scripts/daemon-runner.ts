import { fileURLToPath } from "url";
import { existsSync } from "node:fs";
import { runSupervisor } from "./supervisor.js";

function resolveWorkerEntry(): string {
  const candidates = [
    fileURLToPath(new URL("../server/server/index.js", import.meta.url)),
    fileURLToPath(new URL("../dist/server/server/index.js", import.meta.url)),
    fileURLToPath(new URL("../src/server/index.ts", import.meta.url)),
    fileURLToPath(new URL("../../src/server/index.ts", import.meta.url)),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function resolveWorkerExecArgv(): string[] {
  const workerEntry = resolveWorkerEntry();
  return workerEntry.endsWith(".ts") ? ["--import", "tsx"] : [];
}

runSupervisor({
  name: "DaemonRunner",
  startupMessage: "Starting daemon worker (IPC restart enabled)",
  resolveWorkerEntry,
  workerArgs: process.argv.slice(2),
  workerEnv: process.env,
  workerExecArgv: resolveWorkerExecArgv(),
  restartOnCrash: false,
  shutdownReasons: ["cli_shutdown"],
});
