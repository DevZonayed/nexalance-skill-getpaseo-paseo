import type { Command } from "commander";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { getOrCreateServerId, findExecutable, applyProviderEnv } from "@getpaseo/server";
import { tryConnectToDaemon } from "../../utils/client.js";
import type { CommandOptions, ListResult, OutputSchema } from "../../output/index.js";
import { resolveLocalDaemonState, resolveTcpHostFromListen } from "./local-daemon.js";
import { resolveNodePathFromPid } from "./runtime-toolchain.js";

interface ProviderBinaryStatus {
  label: string;
  path: string | null;
  version: string | null;
}

interface DaemonStatus {
  serverId: string | null;
  status: "running" | "stopped" | "unresponsive";
  home: string;
  listen: string;
  hostname: string | null;
  pid: number | null;
  startedAt: string | null;
  owner: string | null;
  logPath: string;
  runningAgents: number | null;
  idleAgents: number | null;
  daemonNode: string;
  cliNode: string;
  cliVersion: string;
  providers: ProviderBinaryStatus[];
  note?: string;
}

interface StatusRow {
  key: string;
  value: string;
}

type CliPackageJson = {
  version?: unknown;
};

const require = createRequire(import.meta.url);

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function shortenMessage(message: string, max = 120): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3)}...`;
}

function appendNote(current: string | undefined, next: string | undefined): string | undefined {
  if (!next) return current;
  if (!current) return next;
  return `${current}; ${next}`;
}

function resolveCliVersion(): string {
  try {
    const packageJson = require("../../../package.json") as CliPackageJson;
    if (typeof packageJson.version === "string" && packageJson.version.trim().length > 0) {
      return packageJson.version.trim();
    }
  } catch {
    // Fall through.
  }
  return "unknown";
}

function createStatusSchema(status: DaemonStatus): OutputSchema<StatusRow> {
  return {
    idField: "key",
    columns: [
      { header: "KEY", field: "key" },
      {
        header: "VALUE",
        field: "value",
        color: (_, item) => {
          if (item.key === "Status") {
            if (item.value === "running") return "green";
            if (item.value === "unresponsive") return "yellow";
            return "red";
          }
          if (item.key.startsWith("  ")) {
            if (item.value === "not found") return "red";
            if (item.value.endsWith("(--version failed)")) return "yellow";
            return "green";
          }
          return undefined;
        },
      },
    ],
    serialize: () => status,
  };
}

function toStatusRows(status: DaemonStatus): StatusRow[] {
  const rows: StatusRow[] = [
    { key: "Server ID", value: status.serverId ?? "-" },
    { key: "Status", value: status.status },
    { key: "Home", value: status.home },
    { key: "Listen", value: status.listen },
    { key: "Hostname", value: status.hostname ?? "-" },
    { key: "PID", value: status.pid === null ? "-" : String(status.pid) },
    { key: "Started", value: status.startedAt ?? "-" },
    { key: "Owner", value: status.owner ?? "-" },
    { key: "Logs", value: status.logPath },
    { key: "Daemon Node", value: status.daemonNode },
    { key: "CLI Node", value: status.cliNode },
    { key: "CLI", value: status.cliVersion },
  ];

  if (status.runningAgents !== null && status.idleAgents !== null) {
    rows.push({
      key: "Agents",
      value: `${status.runningAgents} running, ${status.idleAgents} idle`,
    });
  } else {
    rows.push({
      key: "Agents",
      value: "Unavailable (daemon API not reachable)",
    });
  }

  if (status.note) {
    rows.push({ key: "Note", value: status.note });
  }

  rows.push({ key: "", value: "" });
  rows.push({ key: "Providers", value: "" });
  for (const provider of status.providers) {
    if (!provider.path) {
      rows.push({ key: `  ${provider.label}`, value: "not found" });
    } else if (!provider.version) {
      rows.push({ key: `  ${provider.label}`, value: `${provider.path} (--version failed)` });
    } else {
      rows.push({ key: `  ${provider.label}`, value: `${provider.path} (${provider.version})` });
    }
  }

  return rows;
}

const PROVIDER_BINARIES: { label: string; binary: string }[] = [
  { label: "Claude", binary: "claude" },
  { label: "Codex", binary: "codex" },
  { label: "OpenCode", binary: "opencode" },
];

function checkProviderBinary(binary: string): { path: string | null; version: string | null } {
  const binaryPath = findExecutable(binary);
  if (!binaryPath) {
    return { path: null, version: null };
  }
  const env = applyProviderEnv(process.env);
  try {
    const output = execFileSync(binaryPath, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    }).trim();
    return { path: binaryPath, version: output || null };
  } catch {
    return { path: binaryPath, version: null };
  }
}

function checkProviderBinaries(): ProviderBinaryStatus[] {
  return PROVIDER_BINARIES.map(({ label, binary }) => {
    const result = checkProviderBinary(binary);
    return { label, ...result };
  });
}

function resolveOwnerLabel(uid: number | undefined, hostname: string | undefined): string | null {
  if (uid === undefined && !hostname) {
    return null;
  }
  const uidPart = uid === undefined ? "?" : String(uid);
  const hostPart = hostname ?? "unknown-host";
  return `${uidPart}@${hostPart}`;
}

export type StatusResult = ListResult<StatusRow>;

export async function runStatusCommand(
  options: CommandOptions,
  _command: Command,
): Promise<StatusResult> {
  const home = typeof options.home === "string" ? options.home : undefined;
  const state = resolveLocalDaemonState({ home });

  const owner = resolveOwnerLabel(state.pidInfo?.uid, state.pidInfo?.hostname);
  let daemonNode: string;
  if (!state.running) {
    daemonNode = "-";
  } else if (state.pidInfo?.pid) {
    const fromPid = resolveNodePathFromPid(state.pidInfo.pid);
    daemonNode = fromPid.nodePath ?? `unknown (${fromPid.error ?? "could not resolve from PID"})`;
  } else {
    daemonNode = "unknown (no PID available)";
  }
  const cliNode = process.execPath;
  let status: DaemonStatus["status"] = state.running ? "running" : "stopped";
  let runningAgents: number | null = null;
  let idleAgents: number | null = null;
  let note: string | undefined;

  if (!state.running && state.stalePidFile && state.pidInfo) {
    note = `Stale PID file found for PID ${state.pidInfo.pid}`;
  }

  if (state.running) {
    const host = resolveTcpHostFromListen(state.listen);
    if (host) {
      const client = await tryConnectToDaemon({ host, timeout: 1500 });
      if (client) {
        try {
          const agentsPayload = await client.fetchAgents({ filter: { includeArchived: true } });
          const agents = agentsPayload.entries.map((entry) => entry.agent);
          runningAgents = agents.filter((a) => a.status === "running").length;
          idleAgents = agents.filter((a) => a.status === "idle").length;
        } catch {
          status = "unresponsive";
          note = appendNote(note, `Daemon PID is running but API requests to ${host} failed`);
        } finally {
          await client.close().catch(() => {});
        }
      } else {
        status = "unresponsive";
        note = appendNote(note, `Daemon PID is running but websocket at ${host} is not reachable`);
      }
    } else {
      note = appendNote(note, "Daemon is configured for unix socket listen; API probe skipped");
    }
  }

  const cliVersion = resolveCliVersion();

  let serverId: string | null = null;
  try {
    serverId = getOrCreateServerId(state.home);
  } catch (error) {
    note = appendNote(note, `serverId unavailable: ${shortenMessage(normalizeError(error))}`);
  }

  const providers = checkProviderBinaries();

  const daemonStatus: DaemonStatus = {
    serverId,
    status,
    home: state.home,
    listen: state.listen,
    hostname: state.pidInfo?.hostname ?? null,
    pid: state.pidInfo?.pid ?? null,
    startedAt: state.pidInfo?.startedAt ?? null,
    owner,
    logPath: state.logPath,
    runningAgents,
    idleAgents,
    daemonNode,
    cliNode,
    cliVersion,
    providers,
    note,
  };

  return {
    type: "list",
    data: toStatusRows(daemonStatus),
    schema: createStatusSchema(daemonStatus),
  };
}
