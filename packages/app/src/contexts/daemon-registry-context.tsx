import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { decodeOfferFragmentPayload, normalizeHostPort } from '@/utils/daemon-endpoints'
import { probeConnection } from '@/utils/test-daemon-connection'
import { useAppSettings, type AppSettings } from '@/hooks/use-settings'
import { ConnectionOfferSchema, type ConnectionOffer } from '@server/shared/connection-offer'
import {
  getManagedDaemonStatus,
  type ManagedDaemonStatus,
  shouldUseManagedDesktopDaemon,
  startManagedDaemon,
} from '@/desktop/managed-runtime/managed-runtime'

const REGISTRY_STORAGE_KEY = '@paseo:daemon-registry'
const DAEMON_REGISTRY_QUERY_KEY = ['daemon-registry']
const DEFAULT_LOCALHOST_ENDPOINT = 'localhost:6767'
const DEFAULT_LOCALHOST_BOOTSTRAP_KEY = '@paseo:default-localhost-bootstrap-v1'
const DEFAULT_LOCALHOST_BOOTSTRAP_TIMEOUT_MS = 2500
const DEFAULT_LOCAL_TRANSPORT_BOOTSTRAP_TIMEOUT_MS = 6000
const DEFAULT_LOCAL_TRANSPORT_BOOTSTRAP_RETRY_MS = 2000
const DEFAULT_LOCAL_TRANSPORT_BOOTSTRAP_DEADLINE_MS = 120000
const E2E_STORAGE_KEY = '@paseo:e2e'

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

export type HostLifecycle = {
  managed: boolean
  managedRuntimeId: string | null
  managedRuntimeVersion: string | null
  associatedServerId: string | null
}

export type HostProfile = {
  serverId: string
  label: string
  lifecycle: HostLifecycle
  connections: HostConnection[]
  preferredConnectionId: string | null
  createdAt: string
  updatedAt: string
}

export type UpdateHostInput = Partial<Omit<HostProfile, 'serverId' | 'createdAt'>>

export type ManagedHostReconciliationInput = {
  serverId: string
  hostname?: string | null
  runtimeId: string
  runtimeVersion: string
  transportType: string
  transportPath: string
  associatedServerId?: string | null
}

export type LocalhostHostReconciliationInput = {
  serverId: string
  hostname: string | null
  endpoint: string
}

export type DesktopStartupReconciliationInput = {
  existing: HostProfile[]
  managed: ManagedHostReconciliationInput | null
  localhost: LocalhostHostReconciliationInput | null
  now?: string
}

interface DaemonRegistryContextValue {
  daemons: HostProfile[]
  isLoading: boolean
  error: unknown | null
  upsertDirectConnection: (input: {
    serverId: string
    endpoint: string
    label?: string
  }) => Promise<HostProfile>
  upsertRelayConnection: (input: {
    serverId: string
    relayEndpoint: string
    daemonPublicKeyB64: string
    label?: string
  }) => Promise<HostProfile>
  updateHost: (serverId: string, updates: UpdateHostInput) => Promise<void>
  removeHost: (serverId: string) => Promise<void>
  removeConnection: (serverId: string, connectionId: string) => Promise<void>
  upsertDaemonFromOffer: (offer: ConnectionOffer) => Promise<HostProfile>
  upsertDaemonFromOfferUrl: (offerUrlOrFragment: string) => Promise<HostProfile>
}

const DaemonRegistryContext = createContext<DaemonRegistryContextValue | null>(null)

function defaultLifecycle(): HostLifecycle {
  return {
    managed: false,
    managedRuntimeId: null,
    managedRuntimeVersion: null,
    associatedServerId: null,
  }
}

function normalizeHostLabel(value: string | null | undefined, serverId: string): string {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : serverId
}

function normalizeEndpointOrNull(endpoint: string): string | null {
  try {
    return normalizeHostPort(endpoint)
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function normalizeManagedTransportConnection(input: {
  transportType: string
  transportPath: string
}): HostConnection | null {
  const transportPath = input.transportPath.trim()
  if (!transportPath) {
    return null
  }

  if (input.transportType === 'tcp') {
    try {
      const endpoint = normalizeHostPort(transportPath)
      return {
        id: `direct:${endpoint}`,
        type: 'directTcp',
        endpoint,
      }
    } catch {
      return null
    }
  }

  if (input.transportType === 'pipe') {
    return {
      id: `pipe:${transportPath}`,
      type: 'directPipe',
      path: transportPath,
    }
  }

  if (input.transportType === 'socket') {
    return {
      id: `socket:${transportPath}`,
      type: 'directSocket',
      path: transportPath,
    }
  }

  return null
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

function normalizeStoredLifecycle(lifecycle: unknown): HostLifecycle {
  const record =
    lifecycle && typeof lifecycle === 'object' ? (lifecycle as Record<string, unknown>) : null

  return {
    managed: record?.managed === true,
    managedRuntimeId:
      typeof record?.managedRuntimeId === 'string' ? record.managedRuntimeId : null,
    managedRuntimeVersion:
      typeof record?.managedRuntimeVersion === 'string' ? record.managedRuntimeVersion : null,
    associatedServerId:
      typeof record?.associatedServerId === 'string' ? record.associatedServerId : null,
  }
}

function normalizeStoredHostProfile(entry: unknown): HostProfile | null {
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

  const lifecycle = normalizeStoredLifecycle(record.lifecycle)
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
    lifecycle,
    connections,
    preferredConnectionId,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  }
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
  return (
    left.managed === right.managed &&
    left.managedRuntimeId === right.managedRuntimeId &&
    left.managedRuntimeVersion === right.managedRuntimeVersion &&
    left.associatedServerId === right.associatedServerId
  )
}

function upsertHostConnectionInProfiles(input: {
  profiles: HostProfile[]
  serverId: string
  label?: string
  lifecycle?: Partial<HostLifecycle>
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
      lifecycle: {
        ...defaultLifecycle(),
        ...(input.lifecycle ?? {}),
      },
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

  const nextLifecycle = {
    ...prev.lifecycle,
    ...(input.lifecycle ?? {}),
  }
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

function reconcileManagedHostInProfiles(input: {
  profiles: HostProfile[]
  managed: ManagedHostReconciliationInput
  now?: string
}): HostProfile[] {
  const connection = normalizeManagedTransportConnection(input.managed)
  if (!connection) {
    throw new Error(`Unsupported managed daemon transport: ${input.managed.transportType}`)
  }

  const nextBase = input.profiles.filter((daemon) => {
    return !daemon.lifecycle.managed || daemon.serverId === input.managed.serverId
  })
  const profiles = nextBase.length === input.profiles.length ? input.profiles : nextBase

  return upsertHostConnectionInProfiles({
    profiles,
    serverId: input.managed.serverId,
    label: input.managed.hostname ?? undefined,
    lifecycle: {
      managed: true,
      managedRuntimeId: input.managed.runtimeId,
      managedRuntimeVersion: input.managed.runtimeVersion,
      associatedServerId:
        input.managed.associatedServerId?.trim() || input.managed.serverId,
    },
    connection,
    now: input.now,
  })
}

export function reconcileDesktopStartupRegistry(
  input: DesktopStartupReconciliationInput
): HostProfile[] {
  let next = input.existing

  if (input.managed) {
    next = reconcileManagedHostInProfiles({
      profiles: next,
      managed: input.managed,
      now: input.now,
    })
  }

  if (input.localhost) {
    next = upsertHostConnectionInProfiles({
      profiles: next,
      serverId: input.localhost.serverId,
      label: input.localhost.hostname ?? undefined,
      connection: {
        id: `direct:${input.localhost.endpoint}`,
        type: 'directTcp',
        endpoint: input.localhost.endpoint,
      },
      now: input.now,
    })
  }

  return next
}

export async function resolveManagedDesktopStartupStatus(input: {
  settings: Pick<AppSettings, 'manageBuiltInDaemon'>
  startManagedDaemonFn?: () => Promise<ManagedDaemonStatus>
  getManagedDaemonStatusFn?: () => Promise<ManagedDaemonStatus>
}): Promise<ManagedDaemonStatus> {
  if (input.settings.manageBuiltInDaemon) {
    return await (input.startManagedDaemonFn ?? startManagedDaemon)()
  }

  return await (input.getManagedDaemonStatusFn ?? getManagedDaemonStatus)()
}

async function probeManagedStartupTarget(input: {
  managedDaemon: ManagedDaemonStatus
  cancelled?: () => boolean
}): Promise<ManagedHostReconciliationInput | null> {
  const connection = normalizeManagedTransportConnection({
    transportType: input.managedDaemon.transportType,
    transportPath: input.managedDaemon.transportPath,
  })
  if (!connection) {
    return null
  }

  let serverId = input.managedDaemon.serverId
  let hostname = input.managedDaemon.hostname

  if (!serverId) {
    const probed = await probeConnection(connection, {
      timeoutMs: DEFAULT_LOCAL_TRANSPORT_BOOTSTRAP_TIMEOUT_MS,
    })
    if (input.cancelled?.()) {
      throw new Error('Managed daemon bootstrap cancelled')
    }
    serverId = probed.serverId
    hostname = hostname ?? probed.hostname
  }

  return {
    serverId,
    hostname,
    runtimeId: input.managedDaemon.runtimeId,
    runtimeVersion: input.managedDaemon.runtimeVersion,
    transportType: input.managedDaemon.transportType,
    transportPath: input.managedDaemon.transportPath,
    associatedServerId: input.managedDaemon.serverId,
  }
}

async function probeManagedConnectionUntilReady(
  input: {
    managedDaemon: ManagedDaemonStatus
    cancelled?: () => boolean
  }
): Promise<ManagedHostReconciliationInput | null> {
  const startedAt = Date.now()
  let lastError: unknown = null

  while (Date.now() - startedAt < DEFAULT_LOCAL_TRANSPORT_BOOTSTRAP_DEADLINE_MS) {
    if (input.cancelled?.()) {
      throw new Error('Managed daemon bootstrap cancelled')
    }

    try {
      return await probeManagedStartupTarget(input)
    } catch (error) {
      lastError = error
      if (input.cancelled?.()) {
        throw error
      }
      await sleep(DEFAULT_LOCAL_TRANSPORT_BOOTSTRAP_RETRY_MS)
    }
  }

  throw lastError ?? new Error('Managed daemon bootstrap timed out')
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

export function useDaemonRegistry(): DaemonRegistryContextValue {
  const ctx = useContext(DaemonRegistryContext)
  if (!ctx) {
    throw new Error('useDaemonRegistry must be used within DaemonRegistryProvider')
  }
  return ctx
}

export function DaemonRegistryProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const desktopStartupReconciledRef = useRef(false)
  const localhostBootstrapAttemptedRef = useRef(false)
  const { settings, isLoading: settingsLoading } = useAppSettings()
  const {
    data: daemons = [],
    isPending,
    error,
  } = useQuery({
    queryKey: DAEMON_REGISTRY_QUERY_KEY,
    queryFn: loadDaemonRegistryFromStorage,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const persist = useCallback(
    async (profiles: HostProfile[]) => {
      queryClient.setQueryData<HostProfile[]>(DAEMON_REGISTRY_QUERY_KEY, profiles)
      await AsyncStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(profiles))
    },
    [queryClient]
  )

  const readDaemons = useCallback(() => {
    return queryClient.getQueryData<HostProfile[]>(DAEMON_REGISTRY_QUERY_KEY) ?? daemons
  }, [queryClient, daemons])

  const updateHost = useCallback(
    async (serverId: string, updates: UpdateHostInput) => {
      const next = readDaemons().map((daemon) =>
        daemon.serverId === serverId
          ? {
              ...daemon,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : daemon
      )
      await persist(next)
    },
    [persist, readDaemons]
  )

  const removeHost = useCallback(
    async (serverId: string) => {
      const existing = readDaemons()
      const remaining = existing.filter((daemon) => daemon.serverId !== serverId)
      await persist(remaining)
    },
    [persist, readDaemons]
  )

  const removeConnection = useCallback(
    async (serverId: string, connectionId: string) => {
      const existing = readDaemons()
      const now = new Date().toISOString()
      const next = existing
        .map((daemon) => {
          if (daemon.serverId !== serverId) return daemon
          const remaining = daemon.connections.filter((conn) => conn.id !== connectionId)
          if (remaining.length === 0) {
            return null
          }
          const preferred =
            daemon.preferredConnectionId === connectionId
              ? (remaining[0]?.id ?? null)
              : daemon.preferredConnectionId
          return {
            ...daemon,
            connections: remaining,
            preferredConnectionId: preferred,
            updatedAt: now,
          } satisfies HostProfile
        })
        .filter((entry): entry is HostProfile => entry !== null)
      await persist(next)
    },
    [persist, readDaemons]
  )

  const upsertHostConnection = useCallback(
    async (input: {
      serverId: string
      label?: string
      lifecycle?: Partial<HostLifecycle>
      connection: HostConnection
    }) => {
      const now = new Date().toISOString()
      const next = upsertHostConnectionInProfiles({
        profiles: readDaemons(),
        serverId: input.serverId,
        label: input.label,
        lifecycle: input.lifecycle,
        connection: input.connection,
        now,
      })
      await persist(next)
      return next.find((daemon) => daemon.serverId === input.serverId) as HostProfile
    },
    [persist, readDaemons]
  )

  const upsertDirectConnection = useCallback(
    async (input: { serverId: string; endpoint: string; label?: string }) => {
      const endpoint = normalizeHostPort(input.endpoint)
      return upsertHostConnection({
        serverId: input.serverId,
        label: input.label,
        connection: {
          id: `direct:${endpoint}`,
          type: 'directTcp',
          endpoint,
        },
      })
    },
    [upsertHostConnection]
  )

  useEffect(() => {
    if (isPending) return
    if (settingsLoading) return
    if (!shouldUseManagedDesktopDaemon()) return
    if (desktopStartupReconciledRef.current) return
    desktopStartupReconciledRef.current = true

    let cancelled = false

    const reconcileDesktopStartup = async () => {
      try {
        const isE2E = await AsyncStorage.getItem(E2E_STORAGE_KEY)
        if (cancelled || isE2E) {
          return
        }

        let managed: ManagedHostReconciliationInput | null = null
        try {
          const managedDaemon = await resolveManagedDesktopStartupStatus({
            settings,
          })
          if (managedDaemon.daemonRunning) {
            managed = await probeManagedConnectionUntilReady({
              managedDaemon,
              cancelled: () => cancelled,
            })
          }
        } catch (managedBootstrapError) {
          if (!cancelled) {
            console.warn(
              '[DaemonRegistry] Failed to reconcile managed daemon transport',
              managedBootstrapError
            )
          }
        }

        let localhost: LocalhostHostReconciliationInput | null = null

        try {
          const { serverId, hostname } = await probeConnection(
            {
              id: `bootstrap:${DEFAULT_LOCALHOST_ENDPOINT}`,
              type: 'directTcp',
              endpoint: DEFAULT_LOCALHOST_ENDPOINT,
            },
            { timeoutMs: DEFAULT_LOCALHOST_BOOTSTRAP_TIMEOUT_MS }
          )
          if (!cancelled) {
            localhost = {
              serverId,
              hostname,
              endpoint: DEFAULT_LOCALHOST_ENDPOINT,
            }
          }
        } catch {
          // Best-effort reconciliation only; keep startup resilient if localhost isn't reachable.
        }

        if (cancelled) {
          return
        }

        const existing = readDaemons()
        const next = reconcileDesktopStartupRegistry({
          existing,
          managed,
          localhost,
        })

        if (next !== existing) {
          await persist(next)
        }
      } catch (reconciliationError) {
        if (cancelled) return
        console.warn(
          '[DaemonRegistry] Failed to reconcile desktop startup host connections',
          reconciliationError
        )
      }
    }

    void reconcileDesktopStartup()

    return () => {
      cancelled = true
    }
  }, [
    isPending,
    persist,
    readDaemons,
    settings.manageBuiltInDaemon,
    settingsLoading,
  ])

  useEffect(() => {
    if (isPending) return
    if (shouldUseManagedDesktopDaemon()) return
    if (localhostBootstrapAttemptedRef.current) return
    localhostBootstrapAttemptedRef.current = true

    let cancelled = false

    const bootstrapLocalhost = async () => {
      try {
        const isE2E = await AsyncStorage.getItem(E2E_STORAGE_KEY)
        if (cancelled || isE2E) {
          return
        }

        const alreadyHandled = await AsyncStorage.getItem(DEFAULT_LOCALHOST_BOOTSTRAP_KEY)
        if (cancelled || alreadyHandled) {
          return
        }

        const existing = readDaemons()
        if (registryHasDirectEndpoint(existing, DEFAULT_LOCALHOST_ENDPOINT)) {
          await AsyncStorage.setItem(DEFAULT_LOCALHOST_BOOTSTRAP_KEY, '1')
          return
        }

        try {
          const { serverId, hostname } = await probeConnection(
            {
              id: `bootstrap:${DEFAULT_LOCALHOST_ENDPOINT}`,
              type: 'directTcp',
              endpoint: DEFAULT_LOCALHOST_ENDPOINT,
            },
            { timeoutMs: DEFAULT_LOCALHOST_BOOTSTRAP_TIMEOUT_MS }
          )
          if (cancelled) return

          await upsertDirectConnection({
            serverId,
            endpoint: DEFAULT_LOCALHOST_ENDPOINT,
            label: hostname ?? undefined,
          })
          await AsyncStorage.setItem(DEFAULT_LOCALHOST_BOOTSTRAP_KEY, '1')
        } catch {
          // Best-effort bootstrap only; keep startup resilient if localhost isn't reachable.
        }
      } catch (bootstrapError) {
        if (cancelled) return
        console.warn('[DaemonRegistry] Failed to bootstrap host connections', bootstrapError)
      }
    }

    void bootstrapLocalhost()

    return () => {
      cancelled = true
    }
  }, [
    isPending,
    readDaemons,
    upsertDirectConnection,
  ])

  const upsertRelayConnection = useCallback(
    async (input: {
      serverId: string
      relayEndpoint: string
      daemonPublicKeyB64: string
      label?: string
    }) => {
      const relayEndpoint = normalizeHostPort(input.relayEndpoint)
      const daemonPublicKeyB64 = input.daemonPublicKeyB64.trim()
      if (!daemonPublicKeyB64) {
        throw new Error('daemonPublicKeyB64 is required')
      }
      return upsertHostConnection({
        serverId: input.serverId,
        label: input.label,
        connection: {
          id: `relay:${relayEndpoint}`,
          type: 'relay',
          relayEndpoint,
          daemonPublicKeyB64,
        },
      })
    },
    [upsertHostConnection]
  )

  const upsertDaemonFromOffer = useCallback(
    async (offer: ConnectionOffer) => {
      return upsertRelayConnection({
        serverId: offer.serverId,
        relayEndpoint: offer.relay.endpoint,
        daemonPublicKeyB64: offer.daemonPublicKeyB64,
      })
    },
    [upsertRelayConnection]
  )

  const upsertDaemonFromOfferUrl = useCallback(
    async (offerUrlOrFragment: string) => {
      const marker = '#offer='
      const idx = offerUrlOrFragment.indexOf(marker)
      if (idx === -1) {
        throw new Error('Missing #offer= fragment')
      }
      const encoded = offerUrlOrFragment.slice(idx + marker.length).trim()
      if (!encoded) {
        throw new Error('Offer payload is empty')
      }
      const payload = decodeOfferFragmentPayload(encoded)
      const offer = ConnectionOfferSchema.parse(payload)
      return upsertDaemonFromOffer(offer)
    },
    [upsertDaemonFromOffer]
  )

  const value: DaemonRegistryContextValue = {
    daemons,
    isLoading: isPending,
    error: error ?? null,
    upsertDirectConnection,
    upsertRelayConnection,
    updateHost,
    removeHost,
    removeConnection,
    upsertDaemonFromOffer,
    upsertDaemonFromOfferUrl,
  }

  return <DaemonRegistryContext.Provider value={value}>{children}</DaemonRegistryContext.Provider>
}

async function loadDaemonRegistryFromStorage(): Promise<HostProfile[]> {
  try {
    const stored = await AsyncStorage.getItem(REGISTRY_STORAGE_KEY)
    if (!stored) {
      return []
    }

    const parsed = JSON.parse(stored) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((entry) => normalizeStoredHostProfile(entry))
      .filter((entry): entry is HostProfile => entry !== null)
  } catch (error) {
    console.error('[DaemonRegistry] Failed to load daemon registry', error)
    throw error
  }
}
