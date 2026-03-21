import { getDesktopHost, isDesktop } from "@/desktop/host";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";

export type DesktopDaemonState = "starting" | "running" | "stopped" | "errored";

export type DesktopDaemonStatus = {
  serverId: string;
  status: DesktopDaemonState;
  listen: string;
  hostname: string | null;
  pid: number | null;
  home: string;
  error: string | null;
};

export type DesktopDaemonLogs = {
  logPath: string;
  contents: string;
};

export type DesktopPairingOffer = {
  relayEnabled: boolean;
  url: string | null;
  qr: string | null;
};

export type CliSymlinkInstructions = {
  title: string;
  detail: string;
  commands: string;
};

export type LocalTransportTarget = {
  transportType: "socket" | "pipe";
  transportPath: string;
};

type LocalTransportEventPayload = {
  sessionId: string;
  kind: "open" | "message" | "close" | "error";
  text?: string | null;
  binaryBase64?: string | null;
  code?: number | null;
  reason?: string | null;
  error?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDesktopDaemonState(value: unknown): DesktopDaemonState {
  const normalized = toStringOrNull(value)?.toLowerCase();
  switch (normalized) {
    case "starting":
      return "starting";
    case "running":
      return "running";
    case "errored":
    case "error":
      return "errored";
    case "stopped":
    case "stopping":
    case "unknown":
    default:
      return "stopped";
  }
}

function parseDesktopDaemonStatus(raw: unknown): DesktopDaemonStatus {
  if (!isRecord(raw)) {
    throw new Error("Unexpected desktop daemon status response.");
  }
  return {
    serverId: toStringOrNull(raw.serverId) ?? "",
    status: parseDesktopDaemonState(raw.status),
    listen: toStringOrNull(raw.listen) ?? "",
    hostname: toStringOrNull(raw.hostname),
    pid: toNumberOrNull(raw.pid),
    home: toStringOrNull(raw.home) ?? "",
    error: toStringOrNull(raw.error),
  };
}

function parseDesktopDaemonLogs(raw: unknown): DesktopDaemonLogs {
  if (!isRecord(raw)) {
    throw new Error("Unexpected desktop daemon logs response.");
  }
  return {
    logPath: toStringOrNull(raw.logPath) ?? "",
    contents: typeof raw.contents === "string" ? raw.contents : "",
  };
}

function parseDesktopPairingOffer(raw: unknown): DesktopPairingOffer {
  if (!isRecord(raw)) {
    throw new Error("Unexpected desktop daemon pairing response.");
  }
  return {
    relayEnabled: raw.relayEnabled === true,
    url: toStringOrNull(raw.url),
    qr: toStringOrNull(raw.qr),
  };
}

function parseCliSymlinkInstructionsInternal(raw: unknown): CliSymlinkInstructions | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    title: toStringOrNull(raw.title) ?? "",
    detail: toStringOrNull(raw.detail) ?? "",
    commands: toStringOrNull(raw.commands) ?? "",
  };
}

export function shouldUseDesktopDaemon(): boolean {
  return isDesktop();
}

export async function getDesktopDaemonStatus(): Promise<DesktopDaemonStatus> {
  return parseDesktopDaemonStatus(await invokeDesktopCommand("desktop_daemon_status"));
}

export async function startDesktopDaemon(): Promise<DesktopDaemonStatus> {
  return parseDesktopDaemonStatus(await invokeDesktopCommand("start_desktop_daemon"));
}

export async function stopDesktopDaemon(): Promise<DesktopDaemonStatus> {
  return parseDesktopDaemonStatus(await invokeDesktopCommand("stop_desktop_daemon"));
}

export async function restartDesktopDaemon(): Promise<DesktopDaemonStatus> {
  return parseDesktopDaemonStatus(await invokeDesktopCommand("restart_desktop_daemon"));
}

export async function getDesktopDaemonLogs(): Promise<DesktopDaemonLogs> {
  return parseDesktopDaemonLogs(await invokeDesktopCommand("desktop_daemon_logs"));
}

export async function getDesktopDaemonPairing(): Promise<DesktopPairingOffer> {
  return parseDesktopPairingOffer(await invokeDesktopCommand("desktop_daemon_pairing"));
}

export function parseCliSymlinkInstructions(raw: unknown): CliSymlinkInstructions {
  const instructions = parseCliSymlinkInstructionsInternal(raw);
  if (!instructions) {
    throw new Error("Unexpected CLI symlink instructions response.");
  }
  return instructions;
}

export async function getCliSymlinkInstructions(): Promise<CliSymlinkInstructions> {
  return parseCliSymlinkInstructions(await invokeDesktopCommand("cli_symlink_instructions"));
}

export type LocalTransportEventUnlisten = () => void;
export type LocalTransportEventHandler = (payload: LocalTransportEventPayload) => void;

export async function listenToLocalTransportEvents(
  handler: LocalTransportEventHandler,
): Promise<LocalTransportEventUnlisten> {
  const listen = getDesktopHost()?.events?.on;
  if (typeof listen !== "function") {
    throw new Error("Desktop events API is unavailable.");
  }
  const unlisten = await listen("local-daemon-transport-event", (payload: unknown) => {
    if (!isRecord(payload)) {
      return;
    }
    handler({
      sessionId: toStringOrNull(payload.sessionId) ?? "",
      kind: (toStringOrNull(payload.kind) ?? "error") as LocalTransportEventPayload["kind"],
      text: toStringOrNull(payload.text),
      binaryBase64: toStringOrNull(payload.binaryBase64),
      code: toNumberOrNull(payload.code),
      reason: toStringOrNull(payload.reason),
      error: toStringOrNull(payload.error),
    });
  });
  return typeof unlisten === "function" ? unlisten : () => {};
}

export async function openLocalTransportSession(target: LocalTransportTarget): Promise<string> {
  const raw = await invokeDesktopCommand<unknown>("open_local_daemon_transport", target);
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Unexpected local transport session response.");
  }
  return raw;
}

export async function sendLocalTransportMessage(input: {
  sessionId: string;
  text?: string;
  binaryBase64?: string;
}): Promise<void> {
  await invokeDesktopCommand("send_local_daemon_transport_message", {
    sessionId: input.sessionId,
    ...(input.text ? { text: input.text } : {}),
    ...(input.binaryBase64 ? { binaryBase64: input.binaryBase64 } : {}),
  });
}

export async function closeLocalTransportSession(sessionId: string): Promise<void> {
  await invokeDesktopCommand("close_local_daemon_transport", { sessionId });
}
