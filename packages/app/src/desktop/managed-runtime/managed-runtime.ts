import { invokeDesktopCommand } from '@/desktop/tauri/invoke-desktop-command'
import { getTauri, isTauriEnvironment } from '@/utils/tauri'

export type ManagedRuntimeStatus = {
  runtimeId: string
  runtimeVersion: string
  runtimeRoot: string
}

export type ManagedDaemonStatus = {
  runtimeId: string
  runtimeVersion: string
  serverId: string
  status: string
  listen: string
  hostname: string | null
  pid: number | null
  home: string
}

export type ManagedDaemonLogs = {
  logPath: string
  contents: string
}

export type ManagedPairingOffer = {
  relayEnabled: boolean
  url: string | null
  qr: string | null
}

export type CliSymlinkInstructions = {
  title: string
  detail: string
  commands: string
}

export type ManagedTcpSettings = {
  enabled: boolean
  host: string
  port: number
}

export type LocalTransportTarget = {
  transportType: 'socket' | 'pipe'
  transportPath: string
}

type LocalTransportEventPayload = {
  sessionId: string
  kind: 'open' | 'message' | 'close' | 'error'
  text?: string | null
  binaryBase64?: string | null
  code?: number | null
  reason?: string | null
  error?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseManagedRuntimeStatus(raw: unknown): ManagedRuntimeStatus {
  if (!isRecord(raw)) {
    throw new Error('Unexpected managed runtime status response.')
  }
  return {
    runtimeId: toStringOrNull(raw.runtimeId) ?? '',
    runtimeVersion: toStringOrNull(raw.runtimeVersion) ?? '',
    runtimeRoot: toStringOrNull(raw.runtimeRoot) ?? '',
  }
}

function parseManagedDaemonStatus(raw: unknown): ManagedDaemonStatus {
  if (!isRecord(raw)) {
    throw new Error('Unexpected managed daemon status response.')
  }
  return {
    runtimeId: toStringOrNull(raw.runtimeId) ?? '',
    runtimeVersion: toStringOrNull(raw.runtimeVersion) ?? '',
    serverId: toStringOrNull(raw.serverId) ?? '',
    status: toStringOrNull(raw.status) ?? 'unknown',
    listen: toStringOrNull(raw.listen) ?? '',
    hostname: toStringOrNull(raw.hostname),
    pid: toNumberOrNull(raw.pid),
    home: toStringOrNull(raw.home) ?? '',
  }
}

function parseManagedDaemonLogs(raw: unknown): ManagedDaemonLogs {
  if (!isRecord(raw)) {
    throw new Error('Unexpected managed daemon logs response.')
  }
  return {
    logPath: toStringOrNull(raw.logPath) ?? '',
    contents: typeof raw.contents === 'string' ? raw.contents : '',
  }
}

function parseManagedPairingOffer(raw: unknown): ManagedPairingOffer {
  if (!isRecord(raw)) {
    throw new Error('Unexpected managed daemon pairing response.')
  }
  return {
    relayEnabled: raw.relayEnabled === true,
    url: toStringOrNull(raw.url),
    qr: toStringOrNull(raw.qr),
  }
}

function parseCliSymlinkInstructionsInternal(raw: unknown): CliSymlinkInstructions | null {
  if (!isRecord(raw)) {
    return null
  }
  return {
    title: toStringOrNull(raw.title) ?? '',
    detail: toStringOrNull(raw.detail) ?? '',
    commands: toStringOrNull(raw.commands) ?? '',
  }
}

export function shouldUseManagedDesktopDaemon(): boolean {
  return isTauriEnvironment() && getTauri() !== null
}

export async function getManagedRuntimeStatus(): Promise<ManagedRuntimeStatus> {
  return parseManagedRuntimeStatus(await invokeDesktopCommand('managed_runtime_status'))
}

export async function getManagedDaemonStatus(): Promise<ManagedDaemonStatus> {
  return parseManagedDaemonStatus(await invokeDesktopCommand('managed_daemon_status'))
}

export async function startManagedDaemon(): Promise<ManagedDaemonStatus> {
  return parseManagedDaemonStatus(await invokeDesktopCommand('start_managed_daemon'))
}

export async function stopManagedDaemon(): Promise<ManagedDaemonStatus> {
  return parseManagedDaemonStatus(await invokeDesktopCommand('stop_managed_daemon'))
}

export async function restartManagedDaemon(): Promise<ManagedDaemonStatus> {
  return parseManagedDaemonStatus(await invokeDesktopCommand('restart_managed_daemon'))
}

export async function getManagedDaemonLogs(): Promise<ManagedDaemonLogs> {
  return parseManagedDaemonLogs(await invokeDesktopCommand('managed_daemon_logs'))
}

export async function getManagedDaemonPairing(): Promise<ManagedPairingOffer> {
  return parseManagedPairingOffer(await invokeDesktopCommand('managed_daemon_pairing'))
}

export function parseCliSymlinkInstructions(raw: unknown): CliSymlinkInstructions {
  const instructions = parseCliSymlinkInstructionsInternal(raw)
  if (!instructions) {
    throw new Error('Unexpected CLI symlink instructions response.')
  }
  return instructions
}

export async function getCliSymlinkInstructions(): Promise<CliSymlinkInstructions> {
  return parseCliSymlinkInstructions(await invokeDesktopCommand('cli_symlink_instructions'))
}

export async function updateManagedDaemonTcpSettings(
  settings: ManagedTcpSettings
): Promise<ManagedDaemonStatus> {
  return parseManagedDaemonStatus(
    await invokeDesktopCommand('update_managed_daemon_tcp_settings', { settings })
  )
}

export type LocalTransportEventUnlisten = () => void
export type LocalTransportEventHandler = (payload: LocalTransportEventPayload) => void

export async function listenToLocalTransportEvents(
  handler: LocalTransportEventHandler
): Promise<LocalTransportEventUnlisten> {
  const listen = getTauri()?.event?.listen
  if (typeof listen !== 'function') {
    throw new Error('Tauri event API is unavailable.')
  }
  const unlisten = await listen('local-daemon-transport-event', (event: unknown) => {
    const payload = isRecord(event) && isRecord(event.payload) ? event.payload : null
    if (!payload) {
      return
    }
    handler({
      sessionId: toStringOrNull(payload.sessionId) ?? '',
      kind: (toStringOrNull(payload.kind) ?? 'error') as LocalTransportEventPayload['kind'],
      text: toStringOrNull(payload.text),
      binaryBase64: toStringOrNull(payload.binaryBase64),
      code: toNumberOrNull(payload.code),
      reason: toStringOrNull(payload.reason),
      error: toStringOrNull(payload.error),
    })
  })
  return typeof unlisten === 'function' ? unlisten : () => {}
}

export async function openLocalTransportSession(target: LocalTransportTarget): Promise<string> {
  const raw = await invokeDesktopCommand<unknown>('open_local_daemon_transport', target)
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error('Unexpected local transport session response.')
  }
  return raw
}

export async function sendLocalTransportMessage(input: {
  sessionId: string
  text?: string
  binaryBase64?: string
}): Promise<void> {
  await invokeDesktopCommand('send_local_daemon_transport_message', {
    sessionId: input.sessionId,
    ...(input.text ? { text: input.text } : {}),
    ...(input.binaryBase64 ? { binaryBase64: input.binaryBase64 } : {}),
  })
}

export async function closeLocalTransportSession(sessionId: string): Promise<void> {
  await invokeDesktopCommand('close_local_daemon_transport', { sessionId })
}
