import { fork, type ChildProcess } from "child_process";

type RestartMessage = {
  type: "paseo:restart";
  reason?: string;
};

type SupervisorOptions = {
  name: string;
  startupMessage: string;
  resolveWorkerEntry: () => string;
  workerArgs?: string[];
  workerEnv?: NodeJS.ProcessEnv;
  workerExecArgv?: string[];
  restartOnCrash?: boolean;
  shutdownReasons?: string[];
};

function describeExit(code: number | null, signal: NodeJS.Signals | null): string {
  return signal ?? (typeof code === "number" ? `code ${code}` : "unknown");
}

function isRestartMessage(msg: unknown): msg is RestartMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg as { type?: unknown }).type === "paseo:restart"
  );
}

export function runSupervisor(options: SupervisorOptions): void {
  const shutdownReasons = new Set(options.shutdownReasons ?? ["cli_shutdown"]);
  const restartOnCrash = options.restartOnCrash ?? false;
  const workerArgs = options.workerArgs ?? process.argv.slice(2);
  const workerEnv = options.workerEnv ?? process.env;
  const workerExecArgv = options.workerExecArgv ?? ["--import", "tsx"];

  let child: ChildProcess | null = null;
  let restarting = false;
  let shuttingDown = false;

  const log = (message: string): void => {
    process.stderr.write(`[${options.name}] ${message}\n`);
  };

  const spawnWorker = () => {
    let workerEntry: string;
    try {
      // Resolve at spawn time so restarts pick up current filesystem state.
      workerEntry = options.resolveWorkerEntry();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Failed to resolve worker entry: ${message}`);
      process.exit(1);
      return;
    }

    child = fork(workerEntry, workerArgs, {
      stdio: "inherit",
      env: workerEnv,
      execArgv: workerExecArgv,
    });

    child.on("message", (msg: unknown) => {
      if (!isRestartMessage(msg)) {
        return;
      }

      if (msg.reason && shutdownReasons.has(msg.reason)) {
        requestShutdown(`Shutdown requested by worker (${msg.reason})`);
        return;
      }

      requestRestart("Restart requested by worker");
    });

    child.on("exit", (code, signal) => {
      const exitDescriptor = describeExit(code, signal);

      if (shuttingDown) {
        log(`Worker exited (${exitDescriptor}). Supervisor shutting down.`);
        process.exit(0);
      }

      if (restarting || (restartOnCrash && code !== 0 && code !== null)) {
        restarting = false;
        log(`Worker exited (${exitDescriptor}). Restarting worker...`);
        spawnWorker();
        return;
      }

      log(`Worker exited (${exitDescriptor}). Supervisor exiting.`);
      process.exit(typeof code === "number" ? code : 0);
    });
  };

  const requestRestart = (reason: string) => {
    if (!child || restarting || shuttingDown) {
      return;
    }
    restarting = true;
    log(`${reason}. Stopping worker for restart...`);
    child.kill("SIGTERM");
  };

  const requestShutdown = (reason: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    restarting = false;
    log(`${reason}. Stopping worker...`);
    if (!child) {
      process.exit(0);
      return;
    }
    child.kill("SIGTERM");
  };

  const forwardSignal = (signal: NodeJS.Signals) => {
    requestShutdown(`Received ${signal}`);
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  process.stdout.write(`[${options.name}] ${options.startupMessage}\n`);
  spawnWorker();
}
