# Desktop Startup Refactor Plan

## Goal

1. Tauri runs `paseo start`, then polls `paseo daemon status --json` until ready
2. `daemon status --json` returns ALL needed data: serverId, listen address, hostname, status, pid
3. App takes that data and adds it to the registry like any other host
4. App blocks on startup splash until any host runtime goes online (race)
5. 30s timeout → redirect to welcome/add-connection screen

## Core Principles

- The daemon is autonomous. Tauri does not pass `--home`, `--listen`, or read any files.
- `daemon status --json` is the single source of truth. All data comes from it.
- The host registry has no concept of "managed" daemons. A host is just a serverId + connections.

---

## Implementation Plan

### Phase 1: Add serverId to `daemon status --json`

**File: `packages/cli/src/commands/daemon/status.ts`**

`DaemonStatus` currently has: `status`, `home`, `listen`, `pid`, `startedAt`, `owner`, `logPath`, etc.

Add:
- `serverId: string | null`
- `hostname: string | null` (already available from pidInfo, just not in the output)

The status command already calls `resolveLocalDaemonState()` which reads the pid file (has hostname) and resolves home. From home it can call `getOrCreateServerId(home)` to get the serverId. All internal to the status command — Tauri never touches these files.

### Phase 2: Tauri — just start + poll status

**File: `packages/desktop/src-tauri/src/runtime_manager.rs`**

#### 2a. `start_managed_daemon_internal` becomes:

1. Run `paseo start` (no `--home`, no `--listen`)
2. Poll `paseo daemon status --json` in a loop until `status == "running"` and `serverId` is present
3. Return the parsed JSON to the app

#### 2b. Remove all daemon plumbing from Rust

Delete:
- `managed_transport_target()`, `ManagedTransportTarget`
- `default_transport_path()`, `default_transport_type()`
- `default_managed_home()`
- `resolve_paths()` / `ManagedPaths`
- `read_server_id()`, `read_hostname_from_home()`, `read_pid_from_home()`
- `cli_env()` — no `PASEO_HOME` or `PASEO_HOST` injection
- State file reading/writing for transport config
- All direct file I/O for daemon state

Keep:
- `bundled_runtime_root()` — to find bundled Node.js + CLI
- `cli_command()` — to invoke the bundled CLI
- `ensure_runtime_ready_internal()` — to verify runtime extraction

#### 2c. `ManagedDaemonStatus` mirrors `daemon status --json`

- `serverId: string`
- `status: string`
- `listen: string`
- `hostname: string | null`
- `pid: number | null`
- `home: string`
- Plus: `runtimeId`, `runtimeVersion` (from bundled runtime manifest)

App parses `listen` to determine transport type:
- `\\.\pipe\*` or `pipe://` → pipe
- `/` or `unix://` → socket
- `host:port` → tcp

### Phase 3: App — remove "managed" concept from registry

**File: `packages/app/src/contexts/daemon-registry-context.tsx`**

#### 3a. Delete managed-specific code

- `ManagedHostReconciliationInput`
- `DesktopStartupReconciliationInput`
- `reconcileManagedHostInProfiles()`
- `reconcileDesktopStartupRegistry()`
- `probeManagedConnectionUntilReady()`
- `probeManagedStartupTarget()`
- `resolveManagedDesktopStartupStatus()`
- `DEFAULT_LOCAL_TRANSPORT_BOOTSTRAP_*` constants

#### 3b. Remove `managed` from `HostLifecycle`

Remove `managed`, `managedRuntimeId`, `managedRuntimeVersion`, `associatedServerId`. Remove all code that checks `lifecycle.managed`.

#### 3c. Desktop startup effect becomes:

```typescript
const bootstrap = async () => {
  const daemon = await startManagedDaemon()
  if (cancelled || !daemon.serverId) return

  const connection = connectionFromListen(daemon.listen)
  if (!connection) return

  await upsertHostConnection({
    serverId: daemon.serverId,
    label: daemon.hostname ?? undefined,
    connection,
  })
}
```

#### 3d. Remove `isReconciling`

No longer needed. Registry update triggers `MultiDaemonSessionHost` → `syncHosts()` → `HostRuntimeController` connects.

### Phase 4: Index screen — race until online

**File: `packages/app/src/app/index.tsx`**

- New hook: `useAnyHostOnline(serverIds)` — subscribes to `HostRuntimeStore`
- Show splash while: registry loading OR (hosts exist, none online, within 30s)
- Any host goes online → navigate to it
- 30s timeout → WelcomeScreen

Both managed daemon and localhost:6767 race. First to connect wins.

### Phase 5: Localhost bootstrap

Non-desktop: keep the lightweight probe (2.5s, needs serverId from handshake).
Desktop: localhost:6767 added as a race participant alongside the daemon connection.

### Phase 6: Metro must ignore app test files

**Files: `packages/app/metro.config.js` and any directly related Metro resolver helpers/tests**

The app already contains many `*.test.ts` and `*.test.tsx` files under `packages/app/src`. Those files must remain in the repo and must NOT be deleted to make Metro happy.

Implement Metro-side protection so Expo/Metro does not try to bundle app test files from `packages/app/src` during normal app/web startup:

- Treat `*.test.ts`, `*.test.tsx`, `*.spec.ts`, and `*.spec.tsx` under `packages/app/src` as ignored/non-bundle inputs for Metro app resolution
- If the current Metro resolver hook needs to special-case local imports or extensions, update it so test files are skipped cleanly instead of causing bundle resolution crashes
- Preserve Vitest usage for those files; the change is only about Metro bundling behavior, not removing or renaming tests
- If a test index/helper file is needed for app tests, keep it and make Metro ignore it rather than deleting it

---

## What stays the same

- `HostRuntimeController`, `HostRuntimeStore`, `MultiDaemonSessionHost` — no changes
- `DaemonClient` transports — no changes
- The daemon itself — no changes (already autonomous)

## Acceptance Criteria

1. `paseo daemon status --json` returns `serverId`, `listen`, `hostname`, `status`, and `pid`, and desktop startup consumes that shape as the source of truth
2. The app registry no longer contains managed-daemon lifecycle concepts; desktop startup upserts the managed daemon like any other host
3. Desktop startup blocks on the startup splash during the connection race and only leaves it when a host goes online or the 30s timeout expires
4. Desktop still races the managed daemon and `localhost:6767`; non-desktop keeps the lightweight localhost probe
5. Metro does not try to bundle `packages/app/src/**/*.test.*` or `packages/app/src/**/*.spec.*` during normal app startup
6. Existing app test files, including any `index.test.ts` helper needed by tests, remain in the repo and are not deleted as a workaround
7. `npm run typecheck` passes
