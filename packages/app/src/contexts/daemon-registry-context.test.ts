import { describe, expect, it } from 'vitest'
import {
  hostHasDirectEndpoint,
  registryHasDirectEndpoint,
  reconcileDesktopStartupRegistry,
  resolveManagedDesktopStartupStatus,
  type HostProfile,
} from './daemon-registry-context'

function makeHost(input: Partial<HostProfile> & Pick<HostProfile, 'serverId'>): HostProfile {
  const now = '2026-01-01T00:00:00.000Z'
  return {
    serverId: input.serverId,
    label: input.label ?? input.serverId,
    lifecycle: input.lifecycle ?? {
      managed: false,
      managedRuntimeId: null,
      managedRuntimeVersion: null,
      associatedServerId: null,
    },
    connections: input.connections ?? [],
    preferredConnectionId: input.preferredConnectionId ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
}

describe('hostHasDirectEndpoint', () => {
  it('returns true when host has matching direct endpoint', () => {
    const host = makeHost({
      serverId: 'srv_local',
      connections: [{ id: 'direct:localhost:6767', type: 'directTcp', endpoint: 'localhost:6767' }],
      preferredConnectionId: 'direct:localhost:6767',
    })

    expect(hostHasDirectEndpoint(host, 'localhost:6767')).toBe(true)
  })

  it('returns false when only relay connections exist', () => {
    const host = makeHost({
      serverId: 'srv_relay',
      connections: [
        {
          id: 'relay:relay.example:443',
          type: 'relay',
          relayEndpoint: 'relay.example:443',
          daemonPublicKeyB64: 'abcd',
        },
      ],
      preferredConnectionId: 'relay:relay.example:443',
    })

    expect(hostHasDirectEndpoint(host, 'localhost:6767')).toBe(false)
  })
})

describe('registryHasDirectEndpoint', () => {
  it('returns true when any host contains the direct endpoint', () => {
    const hosts: HostProfile[] = [
      makeHost({
        serverId: 'srv_one',
        connections: [{ id: 'direct:127.0.0.1:7777', type: 'directTcp', endpoint: '127.0.0.1:7777' }],
        preferredConnectionId: 'direct:127.0.0.1:7777',
      }),
      makeHost({
        serverId: 'srv_two',
        connections: [{ id: 'direct:localhost:6767', type: 'directTcp', endpoint: 'localhost:6767' }],
        preferredConnectionId: 'direct:localhost:6767',
      }),
    ]

    expect(registryHasDirectEndpoint(hosts, 'localhost:6767')).toBe(true)
  })

  it('returns false when no host has the endpoint', () => {
    const hosts: HostProfile[] = [
      makeHost({
        serverId: 'srv_one',
        connections: [{ id: 'direct:127.0.0.1:7777', type: 'directTcp', endpoint: '127.0.0.1:7777' }],
        preferredConnectionId: 'direct:127.0.0.1:7777',
      }),
    ]

    expect(registryHasDirectEndpoint(hosts, 'localhost:6767')).toBe(false)
  })
})

describe('reconcileDesktopStartupRegistry', () => {
  it('seeds managed and localhost connections as normal host entries', () => {
    const now = '2026-03-08T00:00:00.000Z'

    const result = reconcileDesktopStartupRegistry({
      existing: [],
      managed: {
        serverId: 'srv_managed',
        hostname: 'managed-host',
        runtimeId: 'runtime_1',
        runtimeVersion: '1.2.3',
        transportType: 'socket',
        transportPath: '/Users/test/.paseo-test/paseo.sock',
        associatedServerId: 'srv_managed',
      },
      localhost: {
        serverId: 'srv_localhost',
        hostname: 'local-dev',
        endpoint: 'localhost:6767',
      },
      now,
    })

    expect(result).toEqual([
      makeHost({
        serverId: 'srv_managed',
        label: 'managed-host',
        lifecycle: {
          managed: true,
          managedRuntimeId: 'runtime_1',
          managedRuntimeVersion: '1.2.3',
          associatedServerId: 'srv_managed',
        },
        connections: [
          {
            id: 'socket:/Users/test/.paseo-test/paseo.sock',
            type: 'directSocket',
            path: '/Users/test/.paseo-test/paseo.sock',
          },
        ],
        preferredConnectionId: 'socket:/Users/test/.paseo-test/paseo.sock',
        createdAt: now,
        updatedAt: now,
      }),
      makeHost({
        serverId: 'srv_localhost',
        label: 'local-dev',
        connections: [
          {
            id: 'direct:localhost:6767',
            type: 'directTcp',
            endpoint: 'localhost:6767',
          },
        ],
        preferredConnectionId: 'direct:localhost:6767',
        createdAt: now,
        updatedAt: now,
      }),
    ])
  })

  it('keeps managed and localhost connections together when they resolve to the same server', () => {
    const now = '2026-03-08T00:00:00.000Z'

    const result = reconcileDesktopStartupRegistry({
      existing: [],
      managed: {
        serverId: 'srv_shared',
        hostname: 'devbox',
        runtimeId: 'runtime_1',
        runtimeVersion: '1.2.3',
        transportType: 'socket',
        transportPath: '/Users/test/.paseo-test/paseo.sock',
        associatedServerId: 'srv_shared',
      },
      localhost: {
        serverId: 'srv_shared',
        hostname: 'devbox',
        endpoint: 'localhost:6767',
      },
      now,
    })

    expect(result).toEqual([
      makeHost({
        serverId: 'srv_shared',
        label: 'devbox',
        lifecycle: {
          managed: true,
          managedRuntimeId: 'runtime_1',
          managedRuntimeVersion: '1.2.3',
          associatedServerId: 'srv_shared',
        },
        connections: [
          {
            id: 'socket:/Users/test/.paseo-test/paseo.sock',
            type: 'directSocket',
            path: '/Users/test/.paseo-test/paseo.sock',
          },
          {
            id: 'direct:localhost:6767',
            type: 'directTcp',
            endpoint: 'localhost:6767',
          },
        ],
        preferredConnectionId: 'socket:/Users/test/.paseo-test/paseo.sock',
        createdAt: now,
        updatedAt: now,
      }),
    ])
  })

  it('is idempotent for repeated desktop startup reconciliation', () => {
    const now = '2026-03-08T00:00:00.000Z'

    const first = reconcileDesktopStartupRegistry({
      existing: [],
      managed: {
        serverId: 'srv_shared',
        hostname: 'devbox',
        runtimeId: 'runtime_1',
        runtimeVersion: '1.2.3',
        transportType: 'socket',
        transportPath: '/Users/test/.paseo-test/paseo.sock',
        associatedServerId: 'srv_shared',
      },
      localhost: {
        serverId: 'srv_shared',
        hostname: 'devbox',
        endpoint: 'localhost:6767',
      },
      now,
    })

    const second = reconcileDesktopStartupRegistry({
      existing: first,
      managed: {
        serverId: 'srv_shared',
        hostname: 'devbox',
        runtimeId: 'runtime_1',
        runtimeVersion: '1.2.3',
        transportType: 'socket',
        transportPath: '/Users/test/.paseo-test/paseo.sock',
        associatedServerId: 'srv_shared',
      },
      localhost: {
        serverId: 'srv_shared',
        hostname: 'devbox',
        endpoint: 'localhost:6767',
      },
      now: '2026-03-09T00:00:00.000Z',
    })

    expect(second).toEqual(first)
  })
})

describe('resolveManagedDesktopStartupStatus', () => {
  it('starts the managed daemon when management is enabled', async () => {
    const managedStatus = {
      runtimeId: 'runtime_1',
      runtimeVersion: '1.2.3',
      runtimeRoot: '/runtime',
      managedHome: '/home',
      transportType: 'socket',
      transportPath: '/tmp/paseo.sock',
      daemonPid: 123,
      daemonRunning: true,
      daemonStatus: 'running',
      logPath: '/tmp/daemon.log',
      serverId: 'srv_managed',
      hostname: 'managed-host',
      relayEnabled: true,
      tcpEnabled: false,
      tcpListen: null,
      cliShimPath: null,
    }
    let startCalls = 0
    let statusCalls = 0

    const result = await resolveManagedDesktopStartupStatus({
      settings: { manageBuiltInDaemon: true },
      startManagedDaemonFn: async () => {
        startCalls += 1
        return managedStatus
      },
      getManagedDaemonStatusFn: async () => {
        statusCalls += 1
        return managedStatus
      },
    })

    expect(result).toEqual(managedStatus)
    expect(startCalls).toBe(1)
    expect(statusCalls).toBe(0)
  })

  it('only reads managed daemon status when management is paused', async () => {
    const managedStatus = {
      runtimeId: 'runtime_1',
      runtimeVersion: '1.2.3',
      runtimeRoot: '/runtime',
      managedHome: '/home',
      transportType: 'socket',
      transportPath: '/tmp/paseo.sock',
      daemonPid: null,
      daemonRunning: false,
      daemonStatus: 'stopped',
      logPath: '/tmp/daemon.log',
      serverId: null,
      hostname: null,
      relayEnabled: true,
      tcpEnabled: false,
      tcpListen: null,
      cliShimPath: null,
    }
    let startCalls = 0
    let statusCalls = 0

    const result = await resolveManagedDesktopStartupStatus({
      settings: { manageBuiltInDaemon: false },
      startManagedDaemonFn: async () => {
        startCalls += 1
        return managedStatus
      },
      getManagedDaemonStatusFn: async () => {
        statusCalls += 1
        return managedStatus
      },
    })

    expect(result).toEqual(managedStatus)
    expect(startCalls).toBe(0)
    expect(statusCalls).toBe(1)
  })
})
