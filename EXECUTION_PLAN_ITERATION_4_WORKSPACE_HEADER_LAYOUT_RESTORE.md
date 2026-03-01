# Execution Plan — Iteration 4 (Paseo-orchestrated)

## Strategy

Use a Paseo-managed implementation agent in an isolated git worktree to patch the workspace screen to restore legacy header/layout parity while keeping tabs. Then review, validate with tests + agent-browser, and merge back to `main`.

## Agents

### 1) Implementation agent (Codex)

- Provider/model: `codex / gpt-5.3-codex`
- Mode: `full-access`
- Worktree: `iter4-workspace-header-layout-restore` (base: `main`)
- Responsibilities:
  - Fix `New tab` dropdown to use the established dropdown/menu pattern (not off-screen combobox).
  - Restore workspace header explorer toggle parity with legacy `AgentReadyScreen` (icons, aria state).
  - Restore agent overflow (kebab) menu when active tab is an agent.
  - Add terminal tab close `X` on desktop with confirm + kill terminal mutation.
  - Add/extend Playwright E2E specs for `New tab` on-screen + explorer toggle open/close.
  - Commit changes.

### 2) Reviewer/validator (you/me)

- Review diffs locally.
- Run:
  - `npm run typecheck`
  - `npm run test --workspace=@getpaseo/app`
  - Targeted Playwright spec(s) for this iteration
- Perform agent-browser manual verification (desktop + mobile viewports).

## Tooling / Commands (canonical)

### Create agent (detached)

```bash
paseo run -d \
  --worktree iter4-workspace-header-layout-restore \
  --base main \
  --provider codex \
  --model gpt-5.3-codex \
  --mode full-access \
  --name "🎭 Iter4 workspace header/layout restore" \
  "<paste the implementation prompt>"
```

### Wait

```bash
paseo wait <agent-id>
```

### Review worktree diff

```bash
cd ~/.paseo/worktrees/<hash>/iter4-workspace-header-layout-restore
git status --short --branch
git log -n 5 --oneline
git diff main..HEAD
```

### Merge into main

Prefer `git cherry-pick <commit>` into `/Users/moboudra/dev/paseo` `main` after verification.

## Verification gates (must be green)

### 1) Typecheck

```bash
npm run typecheck
```

### 2) App unit tests

```bash
npm run test --workspace=@getpaseo/app
```

### 3) Playwright E2E (targeted)

Run only the spec(s) for this iteration (avoid unrelated flakes):

```bash
cd packages/app
npx playwright test e2e/workspace-header-tabs-restore.spec.ts
```

## Manual verification (agent-browser)

Use explicit sessions:

```bash
agent-browser --session iter4-desktop open http://localhost:8081
agent-browser --session iter4-mobile open http://localhost:8081
```

Desktop:
- Validate `New tab` dropdown opens on-screen
- Validate explorer toggle opens/closes explorer
- Validate kebab menu appears for agent tabs
- Validate terminal tab `X` close flow

Mobile viewport:
- Validate git/folder icon for explorer toggle
- Validate gestures for left/right sidebars

## Rollback plan

If verification fails:
- Do not merge.
- Patch in worktree until acceptance criteria + gates pass.
- Only then cherry-pick/merge into `main`.

