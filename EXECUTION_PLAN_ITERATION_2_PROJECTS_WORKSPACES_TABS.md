# Execution Plan — Iteration 2 Projects → Workspaces → Tabs (Paseo Orchestrated)

This document describes **how** we will execute the fixes defined in:
- `PLAN_ITERATION_2_PROJECTS_WORKSPACES_TABS.md`

It is optimized for parallel work using **Paseo-managed worktrees** and strict quality gates.

---

## Constraints / Guardrails

- **Do not restart or modify** the user’s main daemon on `localhost:6767`.
- Use **isolated dev stacks** for manual verification (new daemon + new Metro) via:
  - `PASEO_HOME=~/.paseo-<unique>` and `npm run dev` (auto-picks free ports).
- No “legacy view” preserved: we fix the current UX directly (no dead/unused code paths left behind).
- Agents must treat **terminals and agents as equal first-class tab types** (no special layouts).
- Keep changes focused to the reported issues; avoid unrelated refactors.

---

## Work Breakdown (Parallel)

### Agent A — Sidebar drag scoping + sidebar polish

**Worktree:** `polish/sidebar-dnd-and-style`

Responsibilities:
- Fix project drag so dragging a **project header** reorders the **entire project section** (header + workspaces).
- Fix workspace drag so workspaces reorder **only within their project** (no cross-project placement).
- Ensure sidebar list **snaps back** to canonical `Project → Workspaces` structure after any drag.
- Sidebar visuals:
  - remove workspace “border” style, match project “ghost” style language
  - remove “No agents yet”
  - reduce workspace indentation/padding (mobile-friendly)
- Navigation polish:
  - clicking a workspace closes the left sidebar (mobile)

### Agent B — Workspace header + tabs polish (icons, unified create, persistence)

**Worktree:** `polish/workspace-tabs-and-header`

Responsibilities:
- Workspace header shows **branch name** for git workspaces (including base branch like `main`).
- Replace separate “create agent” vs “create terminal” rows with **one unified New Tab control** (agent + terminal).
- Agent tabs show **provider icons** (Claude + Codex minimum, using existing assets/components).
- Fix “remember focused tab per workspace” so:
  - switching away and back restores the last focused agent/terminal tab
  - stored selection is **not overwritten** while agent/terminal lists are still loading

### Agent C — Review / sanity check (no code changes)

Runs after merges to:
- review diff for edge cases + regressions
- double-check acceptance criteria mapping
- call out missing verification steps

---

## Agent Launch Commands (local CLI)

We use the repo-local CLI:

```bash
npm run -s cli -- run --provider codex --model gpt-5.3-codex --mode full-access --worktree <name> --name "<title>" --detach "<prompt>" --quiet
```

Notes:
- `--detach --quiet` returns the agent ID quickly so we can launch in parallel.
- Each agent must **commit** their work in their worktree branch before finishing.

---

## Prompts (exact)

### Prompt for Agent A

Title: `🎭 Sidebar DnD + Polish`

Prompt:
- Implement **only** the items in “Sidebar drag behavior” + “Sidebar visuals + navigation polish” from `PLAN_ITERATION_2_PROJECTS_WORKSPACES_TABS.md`.
- Do not change gestures beyond the required drag constraints.
- Ensure the post-drag list snaps back to the canonical project/workspace grouping.
- Remove “No agents yet” and fix workspace row styling/indentation.
- Close sidebar on workspace selection (mobile).
- Run `npm run typecheck` and `npm run test --workspace=@getpaseo/app` in the worktree.
- Commit with a clear message.

### Prompt for Agent B

Title: `🎭 Workspace Tabs + Header`

Prompt:
- Implement **only** the items in “Workspace header + tab bar fixes” from `PLAN_ITERATION_2_PROJECTS_WORKSPACES_TABS.md`.
- Terminals and agents must be treated as identical first-class tab types (no separate rows/layout).
- Add provider icons for agent tabs (Claude/Codex minimum) using existing app icon components.
- Fix per-workspace focused-tab persistence (don’t overwrite selection while queries are pending).
- Run `npm run typecheck` and `npm run test --workspace=@getpaseo/app` in the worktree.
- Commit with a clear message.

### Prompt for Agent C (review-only)

Title: `🎭 Review: Sidebar + Tabs Polish`

Prompt:
- Review the combined diff for correctness vs acceptance criteria in `PLAN_ITERATION_2_PROJECTS_WORKSPACES_TABS.md`.
- DO NOT edit code. Provide a checklist of anything missing or risky.

---

## Merge Strategy (back to `main`)

1. Wait for Agents A + B to complete.
2. For each worktree branch:
   - verify it has a clean commit history (no unrelated changes)
   - re-run `npm run typecheck` if needed
3. Merge into `main` sequentially:
   - merge A
   - rebase/merge B on top of updated `main` (resolve conflicts if any)
4. Do not delete/prune worktrees until the user has manually verified.

---

## Verification Gates (strict)

### 1) Automated (must pass)

From repo root on `main` after merges:

```bash
npm run typecheck
npm run test --workspace=@getpaseo/app
```

Optional (run if environment supports it; starts isolated daemon/metro itself):

```bash
npm run test:e2e --workspace=@getpaseo/app
```

### 2) Manual (must be performed by us before handing back)

Use an **isolated dev stack** (new daemon + new Metro):

```bash
PASEO_HOME=~/.paseo-iter2-polish npm run dev
```

Then use `agent-browser` to verify the “Manual (agent-browser)” section in:
- `PLAN_ITERATION_2_PROJECTS_WORKSPACES_TABS.md`

---

## Completion Definition

We are “done” when:
- All acceptance criteria in `PLAN_ITERATION_2_PROJECTS_WORKSPACES_TABS.md` are met.
- Automated verification gates pass.
- Manual verification steps pass.
- Changes are merged into `main` with no leftover legacy code paths.

