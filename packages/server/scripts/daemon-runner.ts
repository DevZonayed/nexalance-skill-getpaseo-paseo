import { fileURLToPath } from "url";
import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/server/config.js";
import { acquirePidLock, PidLockError, releasePidLock } from "../src/server/pid-lock.js";
import { resolvePaseoHome } from "../src/server/paseo-home.js";
import { runSupervisor } from "./supervisor.js";
import { applySherpaLoaderEnv } from "../src/server/speech/providers/local/sherpa/sherpa-runtime-env.js";

type DaemonRunnerConfig = {
  devMode: boolean;
  workerArgs: string[];
};

function parseConfig(argv: string[]): DaemonRunnerConfig {
  let devMode = false;
  const workerArgs: string[] = [];

  for (const arg of argv) {
    if (arg === "--dev") {
      devMode = true;
      continue;
    }
    workerArgs.push(arg);
  }

  return { devMode, workerArgs };
}

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

function resolveDevWorkerEntry(): string {
  const candidate = fileURLToPath(new URL("../src/server/index.ts", import.meta.url));
  if (!existsSync(candidate)) {
    throw new Error(`Dev worker entry not found: ${candidate}`);
  }
  return candidate;
}

function resolveWorkerExecArgv(workerEntry: string): string[] {
  return workerEntry.endsWith(".ts") ? ["--import", "tsx"] : [];
}

function resolvePackagedNodeEntrypointRunnerPath(currentScriptPath: string): string | null {
  const packageMarker = `${path.sep}node_modules${path.sep}@getpaseo${path.sep}server${path.sep}`;
  const markerIndex = currentScriptPath.lastIndexOf(packageMarker);
  if (markerIndex === -1) {
    return null;
  }

  const appRoot = currentScriptPath.slice(0, markerIndex);
  const runnerPath = path.join(appRoot, "dist", "daemon", "node-entrypoint-runner.js");
  return existsSync(runnerPath) ? runnerPath : null;
}

function appendLaunchLog(
  launchLogPath: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  const line = [
    new Date().toISOString(),
    "[DaemonRunner]",
    `pid=${process.pid}`,
    message,
    details ? JSON.stringify(details) : "",
  ]
    .filter((part) => part.length > 0)
    .join(" ");

  try {
    appendFileSync(launchLogPath, `${line}\n`, "utf-8");
  } catch {
    // Keep launch debugging best-effort so daemon startup behavior is unchanged.
  }
}

async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2));
  const workerEntry = config.devMode ? resolveDevWorkerEntry() : resolveWorkerEntry();
  const workerExecArgv = resolveWorkerExecArgv(workerEntry);
  const workerEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PASEO_PID_LOCK_MODE: "external",
  };
  const packagedNodeEntrypointRunner =
    process.env.ELECTRON_RUN_AS_NODE === "1"
      ? resolvePackagedNodeEntrypointRunnerPath(fileURLToPath(import.meta.url))
      : null;

  applySherpaLoaderEnv(workerEnv);

  const paseoHome = resolvePaseoHome(workerEnv);
  const launchLogPath = path.join(paseoHome, "daemon-launch.log");
  const daemonConfig = loadConfig(paseoHome, { env: workerEnv });

  appendLaunchLog(launchLogPath, "daemon runner starting", {
    argv: process.argv.slice(2),
    execPath: process.execPath,
    execArgv: process.execArgv,
    workerEntry,
    workerExecArgv,
    devMode: config.devMode,
    listen: daemonConfig.listen,
    packagedNodeEntrypointRunner,
  });

  try {
    await acquirePidLock(paseoHome, daemonConfig.listen, {
      ownerPid: process.pid,
    });
    appendLaunchLog(launchLogPath, "pid lock acquired", {
      ownerPid: process.pid,
      listen: daemonConfig.listen,
    });
  } catch (error) {
    if (error instanceof PidLockError) {
      appendLaunchLog(launchLogPath, "pid lock acquisition failed", {
        message: error.message,
        existingLock: error.existingLock,
      });
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
      return;
    }
    throw error;
  }

  let lockReleased = false;
  const releaseLock = async (): Promise<void> => {
    if (lockReleased) {
      return;
    }
    lockReleased = true;
    appendLaunchLog(launchLogPath, "releasing pid lock", {
      ownerPid: process.pid,
    });
    await releasePidLock(paseoHome, {
      ownerPid: process.pid,
    });
  };

  runSupervisor({
    name: "DaemonRunner",
    launchLogPath,
    startupMessage: config.devMode
      ? "Starting daemon worker (dev mode, crash restarts enabled)"
      : "Starting daemon worker (IPC restart enabled)",
    resolveWorkerEntry: () => workerEntry,
    workerArgs: config.workerArgs,
    workerEnv,
    workerExecArgv,
    resolveWorkerSpawnSpec: packagedNodeEntrypointRunner
      ? (resolvedWorkerEntry) => ({
          command: process.execPath,
          args: [
            packagedNodeEntrypointRunner,
            "node-script",
            resolvedWorkerEntry,
            ...config.workerArgs,
          ],
          env: {
            ...workerEnv,
            ELECTRON_RUN_AS_NODE: "1",
          },
        })
      : undefined,
    restartOnCrash: config.devMode,
    onSupervisorExit: releaseLock,
  });
}

void main().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
