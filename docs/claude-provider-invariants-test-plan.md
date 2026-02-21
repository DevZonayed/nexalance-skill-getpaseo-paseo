# Claude Provider Invariants and Regression Test Plan

## Goal
Lock down behavior for Claude provider stream handling without changing provider interface contracts.

## Non-Negotiable Contract Invariants

- `I1` Provider interface remains unchanged.
  - `stream(prompt) -> AsyncGenerator<AgentStreamEvent>` stays the only provider surface for run streaming.
  - Reference: `packages/server/src/server/agent/agent-sdk-types.ts:337`

- `I2` One prompt submission produces exactly one terminal turn event.
  - Terminal set: `turn_completed | turn_failed | turn_canceled`.
  - No ambiguous completion path.

- `I3` Wait semantics remain status-based, not message-correlation-based.
  - `waitForFinish` resolves on lifecycle outcomes (`idle|error|permission|timeout`).
  - References:
    - `packages/server/src/server/session.ts:5366`
    - `packages/server/src/shared/messages.ts:1523`

- `I4` App chat/input semantics remain status-transition-based.
  - Input processing and queue flush continue to rely on `running` transitions and `updatedAt` ordering.
  - References:
    - `packages/app/src/components/agent-input-area.tsx:222`
    - `packages/app/src/components/agent-input-area.tsx:300`
    - `packages/app/src/contexts/session-context.tsx:485`

- `I5` New prompt must never be satisfied by stale pre-prompt assistant/result events.
  - Old queued events (including system-triggered activity) must not be misattributed as response to latest prompt.

## Existing Coverage (Keep)

- Wait semantics after immediate/rapid sends:
  - `packages/server/src/server/daemon-e2e/wait-for-idle.e2e.test.ts:33`

- Send-while-running recovery under real providers:
  - `packages/server/src/server/daemon-e2e/send-while-running-stuck.real.e2e.test.ts:18`
  - `packages/server/src/server/daemon-e2e/send-while-running-stuck-claude.real.e2e.test.ts:18`

- Claude stale old-turn protection (interrupt-failure path):
  - `packages/server/src/server/agent/providers/claude-agent.interrupt-restart-regression.test.ts:217`

- App stream head/tail flush on terminal events:
  - `packages/app/src/types/stream-event.test.ts:115`

## Missing Coverage (Add)

### M1: Task Notification Interleaving Regression (Claude Unit)

- Add mocked SDK sequence where a queued system/task-notification-related burst causes old assistant/result events to appear before new prompt output.
- Assert latest `session.stream(newPrompt)` does not emit stale assistant text as its reply.
- Expected: `I5` enforced.

### M2: Stale Result Preemption Regression (Claude Unit)

- Add mocked SDK sequence with old pending `result` available right after pushing a new prompt.
- Assert provider ignores/contains stale terminal for previous activity and does not complete new prompt prematurely.
- Expected: `I2` + `I5` enforced.

### M3: Wait Final Snapshot Coherence (Daemon E2E/Integration)

- Add/strengthen test to ensure `waitForFinish` never returns `status: idle` while `final.status === running`.
- Remove need for retry loop workaround in stress scenarios.
- Current stress workaround location:
  - `packages/server/src/server/daemon-e2e/ui-action-stress.real.e2e.test.ts:387`
- Expected: `I3` hard guarantee.

## Implementation Notes (Provider-Internal Only)

- Turn events are valid internal lifecycle markers.
- Do not introduce user-message to assistant-message correlation as a new cross-layer contract.
- Do not modify app/CLI/public daemon wait interfaces.
- Keep all changes scoped to Claude provider internals and regression tests.

## Definition of Done

- Invariants `I1-I5` are unchanged and explicitly covered.
- New tests for `M1-M3` are added and passing.
- Existing tests listed above remain green.
- `npm run typecheck` passes.
