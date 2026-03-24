# Agent Event Stream Redesign

Status: **Implemented** (2026-03-24)

## Problem

The Claude provider had three event paths delivering the same events to the agent-manager:

1. **Foreground stream** (`stream()` → `activeForegroundTurn.queue`)
2. **Live event pump** (`streamLiveEvents()` → `liveEventQueue`) fed by the query pump
3. **JSONL history poller** (`startLiveHistoryPolling()` → `routeSdkMessageFromPump()`)

Routing between paths was timing-based (`Boolean(activeForegroundTurn)`, `pendingRun`). This caused:

- **Duplicate user messages**: trailing SDK events routed to the live queue after `activeForegroundTurn` cleared
- **Stuck running state**: stale `turn_started` from the live path flipped lifecycle back to `running` after finalize set it to terminal
- **Fragile dedup**: `shouldSuppressLiveUserMessageEcho` checked `pendingRun` (already null) and `messageId` (Claude assigns its own UUID)

Codex and OpenCode were stable because they had ONE event path with no routing decision.

## Design

### Core principle

One event source per provider session. Identity-based turn ownership, not timing-based routing.

### Provider contract (`AgentSession`)

```typescript
interface AgentSession {
  readonly provider: AgentProvider;
  readonly id: string | null;
  readonly capabilities: AgentCapabilityFlags;

  // Turn lifecycle
  startTurn(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<{ turnId: string }>;
  interrupt(): Promise<void>;

  // Event delivery (push-based)
  subscribe(callback: (event: AgentStreamEvent) => void): () => void;

  // History (hydration only — never live dispatch)
  streamHistory(): AsyncGenerator<AgentStreamEvent>;

  // Run (uses startTurn + subscribe internally)
  run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult>;

  // Session metadata (unchanged)
  getRuntimeInfo(): Promise<AgentRuntimeInfo>;
  getAvailableModes(): Promise<AgentMode[]>;
  getCurrentMode(): Promise<string | null>;
  setMode(modeId: string): Promise<void>;
  getPendingPermissions(): AgentPermissionRequest[];
  respondToPermission(requestId: string, response: AgentPermissionResponse): Promise<void>;
  describePersistence(): AgentPersistenceHandle | null;
  close(): Promise<void>;
  listCommands?(): Promise<AgentSlashCommand[]>;
  setModel?(modelId: string | null): Promise<void>;
  setThinkingOption?(thinkingOptionId: string | null): Promise<void>;
}
```

### Method contracts

#### `startTurn(prompt, options?): Promise<{ turnId: string }>`

Initiates a foreground turn. The provider validates readiness, generates a unique `turnId`, submits the prompt to the runtime, and resolves once accepted. Resolving means the prompt was accepted — not that the turn has started processing.

Rejects if: session not connected, foreground turn already active, runtime rejects prompt.

#### `subscribe(callback): () => void`

Registers a callback that receives ALL provider events — foreground and autonomous — in provider order. Returns an unsubscribe function. Events carry `turnId` when they belong to a turn.

#### `streamHistory(): AsyncGenerator<AgentStreamEvent>`

Yields persisted timeline items from prior sessions. Hydration only. Does NOT yield live events.

#### `interrupt(): Promise<void>`

Cancels the active foreground turn. The resulting `turn_canceled` event arrives via `subscribe()`.

### Provider-side guarantees

1. **Per-session ordering**: callbacks invoked in provider event order
2. **No concurrent callback execution**: serialized delivery per session
3. **Subscribe-before-start safety**: manager subscribes at session creation, before any `startTurn()` call — no events missed
4. **Callback error isolation**: subscriber throws → provider logs and continues
5. **Deterministic cleanup**: `close()` stops all callbacks; `unsubscribe()` stops that specific callback

### Event tagging

All turn-scoped events carry `turnId: string`. Providers stamp turnId in `notifySubscribers()` from the active turn state (`activeForegroundTurnId` or `autonomousTurn.id`). The manager derives turn kind (foreground vs autonomous) by comparing against its own `activeForegroundTurnId`.

### User message dedup

Claude SDK assigns its own UUID to user messages (does not preserve ours). The provider deduplicates user_message echoes by text content against the most recent foreground prompt.

## Manager

### Single subscription per session

When a session is loaded, the manager subscribes once via `session.subscribe()`. This is the only live input path. Events flow through a single dispatcher that handles lifecycle projection, foreground turn waiters, and UI updates.

### Lifecycle projection from turn identity

- After `startTurn()` resolves: foreground turn is active
- On `turn_started` for active foreground turnId: lifecycle = `running`
- On terminal for active foreground turnId: lifecycle = `idle` or `error`, clear foreground turn
- On autonomous `turn_started`: lifecycle = `running`
- On autonomous terminal: lifecycle = `idle` or `error`

### `streamAgent()` as filtered view

```typescript
async *streamAgent(agentId, prompt, options) {
  const { turnId } = await session.startTurn(prompt, options);
  agent.activeForegroundTurnId = turnId;

  // Foreground turn waiter yields events matching this turnId
  // Ends when terminal event for turnId arrives
}
```

### State model

| Concept | Implementation |
|---------|---------------|
| Foreground turn tracking | `activeForegroundTurnId: string \| null` |
| Lifecycle projection | From turn events via turnId matching |
| Cancellation | `session.interrupt()` + await waiter settlement |

## What was deleted

- `stream()` from `AgentSession` interface and all providers
- `Pushable<T>` async queue from all providers
- `streamLiveEvents()` capability
- `activeForegroundTurn` + foreground queue in Claude provider
- `liveEventQueue` in Claude provider
- `routeSdkMessageFromPump()` timing-based routing (simplified to direct dispatch)
- `startLiveEventPump()` in manager
- `liveEventBacklog` + `flushLiveEventBacklog()` in manager
- `shouldSuppressLiveUserMessageEcho()` in manager
- `startLiveHistoryPolling()` for live dispatch
- `snapHistoryOffsetToEnd()`
- `pendingRun` as iterator reference

## Integration tests

All tests run against real Claude sessions with credentials from `.env.test`. No mocks.

File: `packages/server/src/server/agent/providers/__tests__/claude-agent.event-stream.integration.test.ts`

| Test | What it verifies |
|------|-----------------|
| Basic foreground turn | startTurn → events via subscribe → terminal with matching turnId |
| No duplicate user_messages | Exactly ONE user_message per prompt, even after terminal |
| Lifecycle doesn't get stuck | No stale turn_started after terminal for same turnId |
| Autonomous run | sleep 5 in bg → idle → autonomous wake → idle (distinct turnIds) |
| Interruption | Start long task → interrupt → turn_canceled arrives |
| Sequential turns | Two turns produce distinct turnIds, no cross-contamination |
| Fast-fail | Quick error produces clean terminal, no stale events |
| User message dedup | Exactly one user_message with matching text in event log |

### Invariants (asserted on every test)

1. For each foreground turnId, exactly ONE `user_message` event
2. Every `turn_started` has exactly one matching terminal
3. After terminal for a foreground turnId, no later event with that turnId gets projected as autonomous
4. Autonomous turns between foreground turns are visible with distinct turnIds
