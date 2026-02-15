import type { Command } from 'commander'
import { tryConnectToDaemon } from '../../utils/client.js'
import type { CommandOptions, ListResult, OutputSchema } from '../../output/index.js'
import { resolveLocalDaemonState, resolveTcpHostFromListen } from './local-daemon.js'

interface DaemonStatus {
  status: 'running' | 'stopped' | 'unresponsive'
  home: string
  listen: string
  pid: number | null
  startedAt: string | null
  owner: string | null
  logPath: string
  runningAgents: number | null
  idleAgents: number | null
  note?: string
}

interface StatusRow {
  key: string
  value: string
}

function createStatusSchema(status: DaemonStatus): OutputSchema<StatusRow> {
  return {
    idField: 'key',
    columns: [
      { header: 'KEY', field: 'key' },
      {
        header: 'VALUE',
        field: 'value',
        color: (_, item) => {
          if (item.key !== 'Status') {
            return undefined
          }
          if (item.value === 'running') {
            return 'green'
          }
          if (item.value === 'unresponsive') {
            return 'yellow'
          }
          return 'red'
        },
      },
    ],
    serialize: () => status,
  }
}

function toStatusRows(status: DaemonStatus): StatusRow[] {
  const rows: StatusRow[] = [
    { key: 'Status', value: status.status },
    { key: 'Home', value: status.home },
    { key: 'Listen', value: status.listen },
    { key: 'PID', value: status.pid === null ? '-' : String(status.pid) },
    { key: 'Started', value: status.startedAt ?? '-' },
    { key: 'Owner', value: status.owner ?? '-' },
    { key: 'Logs', value: status.logPath },
  ]

  if (status.runningAgents !== null && status.idleAgents !== null) {
    rows.push({
      key: 'Agents',
      value: `${status.runningAgents} running, ${status.idleAgents} idle`,
    })
  } else {
    rows.push({
      key: 'Agents',
      value: 'Unavailable (daemon API not reachable)',
    })
  }

  if (status.note) {
    rows.push({ key: 'Note', value: status.note })
  }

  return rows
}

function resolveOwnerLabel(uid: number | undefined, hostname: string | undefined): string | null {
  if (uid === undefined && !hostname) {
    return null
  }
  const uidPart = uid === undefined ? '?' : String(uid)
  const hostPart = hostname ?? 'unknown-host'
  return `${uidPart}@${hostPart}`
}

export type StatusResult = ListResult<StatusRow>

export async function runStatusCommand(
  options: CommandOptions,
  _command: Command
): Promise<StatusResult> {
  const home = typeof options.home === 'string' ? options.home : undefined
  const state = resolveLocalDaemonState({ home })

  const owner = resolveOwnerLabel(state.pidInfo?.uid, state.pidInfo?.hostname)
  let status: DaemonStatus['status'] = state.running ? 'running' : 'stopped'
  let runningAgents: number | null = null
  let idleAgents: number | null = null
  let note: string | undefined

  if (!state.running && state.stalePidFile && state.pidInfo) {
    note = `Stale PID file found for PID ${state.pidInfo.pid}`
  }

  if (state.running) {
    const host = resolveTcpHostFromListen(state.listen)
    if (host) {
      const client = await tryConnectToDaemon({ host, timeout: 1500 })
      if (client) {
        try {
          const agentsPayload = await client.fetchAgents({ filter: { includeArchived: true } })
          const agents = agentsPayload.entries.map((entry) => entry.agent)
          runningAgents = agents.filter(a => a.status === 'running').length
          idleAgents = agents.filter(a => a.status === 'idle').length
        } catch {
          status = 'unresponsive'
          note = `Daemon PID is running but API requests to ${host} failed`
        } finally {
          await client.close().catch(() => {})
        }
      } else {
        status = 'unresponsive'
        note = `Daemon PID is running but websocket at ${host} is not reachable`
      }
    } else {
      note = 'Daemon is configured for unix socket listen; API probe skipped'
    }
  }

  const daemonStatus: DaemonStatus = {
    status,
    home: state.home,
    listen: state.listen,
    pid: state.pidInfo?.pid ?? null,
    startedAt: state.pidInfo?.startedAt ?? null,
    owner,
    logPath: state.logPath,
    runningAgents,
    idleAgents,
    note,
  }

  return {
    type: 'list',
    data: toStatusRows(daemonStatus),
    schema: createStatusSchema(daemonStatus),
  }
}
