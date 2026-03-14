Your sole purpose is to make the tests pass in `packages/app`. You fix one failing test per iteration, then report done when the entire suite is green.

## Before you start

Read these docs — they are the law:
- `docs/CODING_STANDARDS.md`
- `docs/TESTING.md`

## Your packages

- `packages/app` — Expo mobile + web client

## Test commands

Always use fail-fast. Do not run the whole suite. Find the first failure fast.

```bash
# Unit tests (vitest)
npm run test -w packages/app -- --bail 1

# E2E tests (Playwright)
npm run test:e2e -w packages/app -- --max-failures 1
```

Skip `*.real.e2e.test.ts` and `*.local.e2e.test.ts` — those are local-only manual tests.

## What to do each iteration

1. Run the unit tests with `--bail 1`. If they pass, run the Playwright e2e tests with `--max-failures 1`.
2. Read the failure output carefully. Understand what the test is actually trying to verify.
3. Fix it. See the rules below for how.
4. Run typecheck: `npm run typecheck`
5. Run the failing test again to confirm it passes.
6. If all tests pass (both unit and e2e), report `done: true`. Otherwise report `done: false` with what failed and what you did.

## Rules — read every one

### Fix strategy

When a test fails:
- **Outdated** (tests removed/renamed APIs, stale selectors) — update the test to match reality. If the test no longer tests anything meaningful, delete it.
- **Flaky** (races, timing, non-deterministic) — find the variance source and make it deterministic. Never add retries or `waitForTimeout` as a fix.
- **Too slow** — make it fast or delete it.
- **Tests unimplemented behavior** — delete it. You are here to fix tests, not build features.

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

### Playwright e2e specifics

The Playwright tests are outdated. When fixing them:
- Update selectors and test IDs to match current UI
- Build shared helpers in `e2e/helpers/` — page objects, common flows, assertions
- Specs should read like a DSL: `await createAgent(page, { provider: 'claude' })` not 20 lines of clicks
- Each spec file shares a single daemon via the fixture system. Do not spawn extra daemons per test.
- Clean up after yourself — if you start a process, kill it by PID when done

### Resource hygiene

- **NEVER kill the daemon running on port 6767** — that is the live development daemon. Killing it will break your own environment.
- When tests spawn ephemeral daemons, ensure cleanup runs even on test failure (use `afterAll` / `afterEach` or Playwright fixtures with teardown).
- Kill processes by PID, never by broad port or name patterns.

### What NOT to do

- Do not add auth checks, environment variable gates, or conditional skips
- Do not introduce mocks
- Do not add new vitest plugins or config changes
- Do not implement new features to make a test pass
- Do not add `// @ts-ignore` or `// @ts-expect-error` to silence type errors
- Do not weaken assertions (e.g., changing `toEqual` to `toBeTruthy`)
