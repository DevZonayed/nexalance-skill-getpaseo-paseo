# Iteration 3 Execution Plan — Paseo Orchestrated

## Principles

- Work happens in an isolated git worktree and merges back to `main` once verified.
- Do not restart or touch the daemon on `localhost:6767`.
- Use the repo’s existing Playwright global setup (isolated daemon/metro) for E2E.
- Pass all gates before merging:
  - Typecheck
  - Vitest
  - Playwright E2E
  - Manual `agent-browser` verification

## Agent Delegation (Paseo)

### Implementation agent (1)

- **Agent:** Codex
- **Mode:** full-access
- **Worktree:** `iter3-workspace-header-tabs-restore`
- **Mission:**
  - Fix New tab dropdown visibility (on-screen, correct pattern)
  - Restore workspace header structure + explorer toggle + agent kebab menu
  - Add terminal close (X) from workspace tab strip
  - Add/adjust Playwright E2E specs for the above
  - Run verification commands before declaring done

### Reviewer (optional, if needed)

- Only used if implementation is large/risky or tests expose subtle regressions.
- Codex or Claude Sonnet as a second-pass reviewer for UI regressions.

## Merge Strategy

1. Agent commits all changes in the worktree.
2. Orchestrator reviews the diff on the worktree.
3. Run gates locally on the worktree:
   - `npm run typecheck`
   - `npm run test --workspace=@getpaseo/app`
   - `npm run test:e2e --workspace=@getpaseo/app`
4. Manual `agent-browser` verification:
   - Desktop viewport: New tab menu visible + explorer toggle + kebab menu
   - Mobile viewport: explorer icon uses git/folder, toggles right sidebar, left sidebar unaffected
5. Merge worktree back into `main` with a fast-forward merge if possible; otherwise merge commit.

## Verification Checklist (strict)

- [ ] New tab menu opens and is visible (desktop)
- [ ] Selecting Agent tab routes to draft agent flow scoped to workspace
- [ ] Selecting Terminal tab creates terminal and focuses it
- [ ] Terminal tabs show X; closing kills terminal and removes tab
- [ ] Workspace header shows branch name
- [ ] Workspace header has explorer toggle with correct icon behavior
- [ ] Agent kebab menu exists when Agent tab active
- [ ] Right sidebar opens/closes via header and mobile swipe gesture
- [ ] Left sidebar gestures unchanged
- [ ] `npm run typecheck` ✅
- [ ] `npm run test --workspace=@getpaseo/app` ✅
- [ ] `npm run test:e2e --workspace=@getpaseo/app` ✅

