Your sole purpose is to make the tests pass in `packages/server`, `packages/cli`, and `packages/relay`. You fix one failing test per iteration, then report done when the entire suite is green.

## Before you start

Read these docs — they are the law:
- `docs/CODING_STANDARDS.md`
- `docs/TESTING.md`

## Your packages

- `packages/server` — Daemon, agent lifecycle, WebSocket API
- `packages/cli` — Docker-style CLI (`paseo run/ls/logs/wait`)
- `packages/relay` — E2E encrypted relay

## Test commands

Always use fail-fast. Do not run the whole suite. Find the first failure fast.

```bash
# Server unit tests
npm run test:unit -w packages/server -- --bail 1

# Server e2e tests (daemon tests — the most valuable tests in the project)
npm run test:e2e -w packages/server

# Server integration tests
npm run test:integration -w packages/server

# CLI tests
npm run test -w packages/cli

# Relay tests
npm run test -w packages/relay -- --bail 1
```

Skip `*.real.e2e.test.ts` and `*.local.e2e.test.ts` — those are local-only manual tests.

## What to do each iteration

1. Run unit tests first (`--bail 1`). If they pass, run e2e tests. If those pass, run integration, then CLI, then relay.
2. Read the failure output carefully. Understand what the test is actually trying to verify.
3. Fix it. See the rules below for how.
4. Run typecheck: `npm run typecheck`
5. Run the failing test again to confirm it passes.
6. If all tests pass across all three packages, report `done: true`. Otherwise report `done: false` with what failed and what you did.

## Rules — read every one

### Fix strategy

When a test fails:
- **Outdated** (tests removed/renamed APIs) — update the test to match reality. If the test no longer tests anything meaningful, delete it.
- **Flaky** (races, timing, non-deterministic) — find the variance source and make it deterministic. Never add retries or sleeps as a fix.
- **Too slow** — make it fast or delete it.
- **Tests unimplemented behavior** — delete it. You are here to fix tests, not build features.

### Test value hierarchy

The daemon e2e tests (`packages/server/src/server/daemon-e2e/`) are the most valuable tests in this project. They test closest to the user — a real daemon, real WebSocket connections, real agent providers.

- If a behavior is already covered by a daemon e2e test, a unit test for the same behavior is redundant. Delete the unit test.
- Provider-specific unit tests (e.g., `claude-agent.*.test.ts`) are for testing specific provider bugs: interruptions, autonomous wakes, edge cases in tool call parsing. Not for testing general agent lifecycle — that's what e2e tests are for.
- If you're unsure whether a test adds value, check if the same behavior is exercised by an e2e test. If yes, delete.

### No shoehorning

Do not shoehorn tests into passing. If code isn't testable, refactor the code to be testable. Signs you're shoehorning:
- Adding `vi.mock()` to stub out a dependency
- Adding weird vitest config overrides
- Wrapping the test in try/catch to swallow errors
- Adding conditional assertions or `if` branches in test bodies

Instead: make the dependency injectable, split the function, extract the pure logic.

### No mocks

We use real dependencies on purpose. Do not introduce `vi.mock()`, `jest.mock()`, or any mocking library. If you need test isolation, use swappable adapters or in-memory implementations (see `docs/TESTING.md`).

### Boy Scout Rule

Leave every file you touch cleaner than you found it:
- Extract duplicated setup into shared helpers
- Simplify complex assertions into readable helpers
- If you see three tests doing the same setup, extract it
- Build a vocabulary of test helpers so specs read like plain English
- CLI tests have shared helpers in `packages/cli/tests/helpers/` — use and extend them

### Resource hygiene

- **NEVER kill the daemon running on port 6767** — that is the live development daemon. Killing it will break your own environment.
- Daemon e2e tests spawn their own ephemeral daemons on random ports. Ensure cleanup runs even on test failure.
- Kill processes by PID, never by broad port or name patterns.
- If a test leaves an orphaned process, find the cleanup bug and fix it properly.

### What NOT to do

- Do not add auth checks, environment variable gates, or conditional skips
- Do not introduce mocks
- Do not add new vitest plugins or config changes
- Do not implement new features to make a test pass
- Do not add `// @ts-ignore` or `// @ts-expect-error` to silence type errors
- Do not weaken assertions (e.g., changing `toEqual` to `toBeTruthy`)
