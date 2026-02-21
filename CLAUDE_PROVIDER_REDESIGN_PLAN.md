# Claude Provider Redesign Plan

## Goal
Eliminate dropped/misrouted Claude messages and stuck lifecycle transitions under foreground/autonomous interleaving by replacing heuristics with an explicit state machine and deterministic routing.

## Non-Negotiable Constraints
1. Single-owner SDK consumption: only one internal pump calls `query.next()`.
2. Task notifications are metadata only, never lifecycle correctness dependencies.
3. Interrupt must work when lifecycle is `running`, even with no foreground `pendingRun`.
4. Public API semantics unchanged:
   - `stream`, `streamHistory`, `interrupt` signatures remain.
   - `waitForFinish` remains status-based (`running -> idle/error/permission/timeout`).

## Final Architecture

### 1) Session Turn Ownership State
`turnState`: `idle | foreground | autonomous`

Transitions:
1. `idle -> foreground` on user `stream()` send.
2. `foreground -> idle` on foreground terminal event.
3. `idle -> autonomous` on first routable autonomous SDK event.
4. `autonomous -> idle` when autonomous run(s) terminal.
5. `autonomous -> foreground` must be atomic:
   - interrupt autonomous
   - await teardown
   - start foreground

### 2) Run Lifecycle Tracking
Per-run state (tracked independently from timeline):
`queued | awaiting_response | streaming | finalizing | completed | interrupted | error`

Session status derives from runs:
- `running` iff any run is in `queued|awaiting_response|streaming|finalizing`
- `permission` iff permission pending
- `error` iff errored
- `idle` otherwise

### 3) Deterministic Event Routing (single decision point)
In the query pump, normalize each SDK event, then route by this order:

1. If `turnState=foreground`: route all non-metadata events to foreground run queue.
2. Else route by identifiers:
   - `task_id`
   - `parent_message_id`
   - `message_id`
   - fallback: create autonomous run
3. If no route: metadata-only event.

No timestamp windows. No suppression/diversion heuristics.

### 4) Timeline Assembly Decoupled from Run Ownership
Timeline is assembled from normalized message events keyed by `message_id`, independent of run ownership:

1. `message_start` -> create/update timeline entry
2. `message_delta` -> append
3. `message_stop` -> finalize
4. Support out-of-order events (placeholder then reconcile)

Guarantee: assistant messages cannot be dropped from timeline due routing ambiguity.

## Refactor Sequence (Low-Risk Migration)
1. Introduce explicit types:
   - `TurnState`
   - `RunTracker` (run map + lifecycle)
   - `TimelineAssembler` (message-id based)
2. Refactor pump flow to:
   - normalize event
   - route via single decision point
   - update run tracker
   - always feed timeline assembler
3. Implement atomic `autonomous -> foreground` transition.
4. Remove old heuristics:
   - suppression windows
   - pre-prompt diversion/grace logic
   - task-notification lifecycle branching
5. Keep manager/provider external contracts unchanged.

## Correctness Invariants
1. Only query pump calls `query.next()`.
2. Foreground exclusivity: while `turnState=foreground`, non-metadata SDK events cannot route to autonomous path.
3. Lifecycle correctness: `running` emitted when any run active; terminal transitions settle back to `idle`.
4. Interrupt correctness: `cancelAgentRun()` works for autonomous running with no foreground `pendingRun`.
5. Timeline completeness: every assistant `message_start/delta/stop` appears in timeline.

## Test Plan

### Unit Tests
1. Deterministic routing by identifier priority.
2. Foreground exclusivity under interleaving events.
3. Run lifecycle transitions (success, interrupt, error).
4. Timeline assembler out-of-order robustness.
5. Manager autonomous cancel path without foreground `pendingRun`.

### Real Claude E2E Gates
1. `repro: do-it-again + immediate hello can hang after autonomous wake under churn`
   - acceptance: autonomous `running` transition observed within timeout each cycle.
2. `repro: transcript/timeline parity after do-it-again + hello race`
   - acceptance: assistant messages present in transcript (including HELLO and autonomous completion) are present in timeline.

## Rollout / Risk Controls
1. Add temporary structured debug logs for:
   - turn state transitions
   - routing decisions (`event -> run`)
   - run lifecycle transitions
   - timeline assembly (`message_id`)
2. Keep clear rollback boundaries by incremental commits:
   - types + scaffolding
   - routing replacement
   - heuristic removal
   - test hardening
3. Run `npm run -w packages/server typecheck` and targeted test suites after each stage.
