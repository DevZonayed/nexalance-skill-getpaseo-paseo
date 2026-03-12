import { normalizeHostPort } from '@server/shared/daemon-endpoints'

export type DirectTcpHostConnection = {
  id: string
  type: 'directTcp'
  endpoint: string
}

export type DirectSocketHostConnection = {
  id: string
  type: 'directSocket'
  path: string
}

export type DirectPipeHostConnection = {
  id: string
  type: 'directPipe'
  path: string
}

export type RelayHostConnection = {
  id: string
  type: 'relay'
  relayEndpoint: string
  daemonPublicKeyB64: string
}

export type HostConnection =
  | DirectTcpHostConnection
  | DirectSocketHostConnection
  | DirectPipeHostConnection
  | RelayHostConnection

export type HostLifecycle = Record<string, never>

export type HostProfile = {
  serverId: string
  label: string
  lifecycle: HostLifecycle
  connections: HostConnection[]
  preferredConnectionId: string | null
  createdAt: string
  updatedAt: string
}

export function defaultLifecycle(): HostLifecycle {
  return {}
}

export function normalizeHostLabel(value: string | null | undefined, serverId: string): string {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : serverId
}

function hostConnectionEquals(left: HostConnection, right: HostConnection): boolean {
  if (left.type !== right.type || left.id !== right.id) {
    return false
  }

  if (left.type === 'directTcp' && right.type === 'directTcp') {
    return left.endpoint === right.endpoint
  }
  if (left.type === 'directSocket' && right.type === 'directSocket') {
    return left.path === right.path
  }
  if (left.type === 'directPipe' && right.type === 'directPipe') {
    return left.path === right.path
  }
  if (left.type === 'relay' && right.type === 'relay') {
    return (
      left.relayEndpoint === right.relayEndpoint &&
      left.daemonPublicKeyB64 === right.daemonPublicKeyB64
    )
  }

  return false
}

function hostLifecycleEquals(left: HostLifecycle, right: HostLifecycle): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function upsertHostConnectionInProfiles(input: {
  profiles: HostProfile[]
  serverId: string
  label?: string
  connection: HostConnection
  now?: string
}): HostProfile[] {
  const serverId = input.serverId.trim()
  if (!serverId) {
    throw new Error('serverId is required')
  }

  const now = input.now ?? new Date().toISOString()
  const labelTrimmed = input.label?.trim() ?? ''
  const derivedLabel = labelTrimmed || serverId
  const existing = input.profiles
  const idx = existing.findIndex((daemon) => daemon.serverId === serverId)

  if (idx === -1) {
    const profile: HostProfile = {
      serverId,
      label: derivedLabel,
      lifecycle: defaultLifecycle(),
      connections: [input.connection],
      preferredConnectionId: input.connection.id,
      createdAt: now,
      updatedAt: now,
    }
    return [...existing, profile]
  }

  const prev = existing[idx]!
  const connectionIdx = prev.connections.findIndex((connection) => connection.id === input.connection.id)
  const hadConnection = connectionIdx !== -1
  const connectionChanged =
    connectionIdx === -1
      ? true
      : !hostConnectionEquals(prev.connections[connectionIdx]!, input.connection)
  const nextConnections =
    connectionIdx === -1
      ? [...prev.connections, input.connection]
      : connectionChanged
        ? prev.connections.map((connection, index) =>
            index === connectionIdx ? input.connection : connection
          )
        : prev.connections

  const nextLifecycle = prev.lifecycle
  const nextLabel = labelTrimmed ? labelTrimmed : prev.label
  const nextPreferredConnectionId = prev.preferredConnectionId ?? input.connection.id
  const changed =
    nextLabel !== prev.label ||
    nextPreferredConnectionId !== prev.preferredConnectionId ||
    !hostLifecycleEquals(prev.lifecycle, nextLifecycle) ||
    !hadConnection ||
    connectionChanged

  if (!changed) {
    return existing
  }

  const nextProfile: HostProfile = {
    ...prev,
    label: nextLabel,
    lifecycle: nextLifecycle,
    connections: nextConnections,
    preferredConnectionId: nextPreferredConnectionId,
    updatedAt: now,
  }

  const next = [...existing]
  next[idx] = nextProfile
  return next
}

export function connectionFromListen(listen: string): HostConnection | null {
  const normalizedListen = listen.trim()
  if (!normalizedListen) {
    return null
  }

  if (normalizedListen.startsWith('pipe://')) {
    const path = normalizedListen.slice('pipe://'.length).trim()
    return path ? { id: `pipe:${path}`, type: 'directPipe', path } : null
  }

  if (normalizedListen.startsWith('unix://')) {
    const path = normalizedListen.slice('unix://'.length).trim()
    return path ? { id: `socket:${path}`, type: 'directSocket', path } : null
  }

  if (normalizedListen.startsWith('\\\\.\\pipe\\')) {
    return {
      id: `pipe:${normalizedListen}`,
      type: 'directPipe',
      path: normalizedListen,
    }
  }

  if (normalizedListen.startsWith('/')) {
    return {
      id: `socket:${normalizedListen}`,
      type: 'directSocket',
      path: normalizedListen,
    }
  }

  try {
    const endpoint = normalizeHostPort(normalizedListen)
    return {
      id: `direct:${endpoint}`,
      type: 'directTcp',
      endpoint,
    }
  } catch {
    return null
  }
}

function normalizeStoredConnection(connection: unknown): HostConnection | null {
  if (!connection || typeof connection !== 'object') {
    return null
  }
  const record = connection as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type : null
  if (type === 'directTcp') {
    try {
      const endpoint = normalizeHostPort(String(record.endpoint ?? ''))
      return { id: `direct:${endpoint}`, type: 'directTcp', endpoint }
    } catch {
      return null
    }
  }
  if (type === 'directSocket') {
    const path = String(record.path ?? '').trim()
    return path ? { id: `socket:${path}`, type: 'directSocket', path } : null
  }
  if (type === 'directPipe') {
    const path = String(record.path ?? '').trim()
    return path ? { id: `pipe:${path}`, type: 'directPipe', path } : null
  }
  if (type === 'relay') {
    try {
      const relayEndpoint = normalizeHostPort(String(record.relayEndpoint ?? ''))
      const daemonPublicKeyB64 = String(record.daemonPublicKeyB64 ?? '').trim()
      if (!daemonPublicKeyB64) return null
      return {
        id: `relay:${relayEndpoint}`,
        type: 'relay',
        relayEndpoint,
        daemonPublicKeyB64,
      }
    } catch {
      return null
    }
  }

  return null
}

export function normalizeStoredHostProfile(entry: unknown): HostProfile | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }
  const record = entry as Record<string, unknown>
  const serverId = typeof record.serverId === 'string' ? record.serverId.trim() : ''
  if (!serverId) {
    return null
  }

  const rawConnections = Array.isArray(record.connections) ? record.connections : []
  const connections = rawConnections
    .map((connection) => normalizeStoredConnection(connection))
    .filter((connection): connection is HostConnection => connection !== null)
  if (connections.length === 0) {
    return null
  }

  const now = new Date().toISOString()
  const label = normalizeHostLabel(
    typeof record.label === 'string' ? record.label : null,
    serverId
  )
  const preferredConnectionId =
    typeof record.preferredConnectionId === 'string' &&
    connections.some((connection) => connection.id === record.preferredConnectionId)
      ? record.preferredConnectionId
      : connections[0]?.id ?? null

  return {
    serverId,
    label,
    lifecycle: defaultLifecycle(),
    connections,
    preferredConnectionId,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  }
}

export function normalizeEndpointOrNull(endpoint: string): string | null {
  try {
    return normalizeHostPort(endpoint)
  } catch {
    return null
  }
}

export function hostHasDirectEndpoint(host: HostProfile, endpoint: string): boolean {
  const normalized = normalizeEndpointOrNull(endpoint)
  if (!normalized) {
    return false
  }
  return host.connections.some(
    (connection) => connection.type === 'directTcp' && connection.endpoint === normalized
  )
}

export function registryHasDirectEndpoint(hosts: HostProfile[], endpoint: string): boolean {
  return hosts.some((host) => hostHasDirectEndpoint(host, endpoint))
}
