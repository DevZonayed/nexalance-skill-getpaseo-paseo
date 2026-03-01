# Execution Plan (Paseo Orchestrator)

This document is the concrete execution plan for `PLAN_PROJECTS_WORKSPACES_TABS.md`, using the Paseo CLI to delegate work to sub-agents running inside isolated git worktrees.

## Conventions

- All agent names are prefixed with `🎭` so they’re easy to identify.
- Use **Codex** for implementation work (`--provider codex --mode full-access`).
- Each agent runs in its **own worktree** to avoid concurrent writes to the same git working directory.
- Agents must avoid “legacy/compat mode” code paths: we are fully redirecting/reworking.

## 0) Preflight

```bash
git branch --show-current
npm run -s cli -- daemon status
```

Expected:
- current branch is `main` (or the branch you want as base)
- daemon is reachable

## 1) Launch parallel agents (detached)

### Agent A — Server protocol + workspace data

Scope:
- Replace file explorer + download token RPC to be **workspace-scoped** (remove `agentId` usage).
- Extend worktree list payload with `createdAt` (and a stable `workspaceId` if needed).
- Ensure agent index loads once at daemon startup (no repeated disk hydration).

```bash
SERVER_ID=$(npm run -s cli -- run -d -q \
  --name "🎭 PWT Server: workspace RPCs" \
  --provider codex --mode full-access \
  --worktree pwt-server-workspace-rpcs --base main \
  "Implement server-side changes from PLAN_PROJECTS_WORKSPACES_TABS.md: replace file_explorer_request and file_download_token_request to be workspace-scoped (no agentId), update handlers + client types, add createdAt to paseo_worktree_list_response, and make agent storage/index load once at daemon startup. Do NOT add legacy compatibility. Keep changes minimal and typecheck. Output a short checklist of touched files + how to test."
)
echo "$SERVER_ID"
```

### Agent B — App: workspace routes + tabs main view

Scope:
- Add workspace routes/screens and redirect old agent routes.
- Implement workspace header + tab bar (agent + terminal tabs).
- Persist/restore last focused tab per workspace.
- Mobile tab switcher + plus button (draft agent flow pre-scoped).

```bash
APP_TABS_ID=$(npm run -s cli -- run -d -q \
  --name "🎭 PWT App: workspace tabs" \
  --provider codex --mode full-access \
  --worktree pwt-app-workspace-tabs --base main \
  "Implement app-side workspace main view + tabs from PLAN_PROJECTS_WORKSPACES_TABS.md. Replace old /h/:serverId/agent routes with workspace routes, render a workspace screen with a horizontal tab bar (agent + terminal tabs), restore last focused tab, and implement a mobile tab switcher + header plus button to open draft agent flow pre-scoped to workspace. Terminals are just tabs; no special casing. Do NOT keep legacy UI. Keep gestures/overlay sidebars unchanged. Typecheck."
)
echo \"$APP_TABS_ID\"
```

### Agent C — App: left sidebar projects → workspaces

Scope:
- Replace left sidebar agent list with Project → Workspace tree.
- Project icon, status dot aggregation, reorder persistence.
- Workspace rows: branch + createdAt, no path.

```bash
APP_SIDEBAR_ID=$(npm run -s cli -- run -d -q \
  --name "🎭 PWT App: projects sidebar" \
  --provider codex --mode full-access \
  --worktree pwt-app-projects-sidebar --base main \
  "Implement the left sidebar rewrite per PLAN_PROJECTS_WORKSPACES_TABS.md: Projects grouped by projectKey (remote when available else local), each project shows icon + status dot, and contains workspaces (main checkout + Paseo worktrees incl empty). Workspace row shows branch name + createdAt only (no path). Keep drag reorder for projects + workspaces and persist on-device. Do not show agents in sidebar. Typecheck."
)
echo \"$APP_SIDEBAR_ID\"
```

### Agent D — App: right sidebar changes + files (workspace-scoped)

Scope:
- Remove terminals from the right sidebar.
- Make Changes/Files sidebar workspace-scoped (not agent-scoped).
- Update file explorer calls to use new workspace-scoped RPC.

```bash
APP_EXPLORER_ID=$(npm run -s cli -- run -d -q \
  --name "🎭 PWT App: explorer sidebar" \
  --provider codex --mode full-access \
  --worktree pwt-app-explorer-sidebar --base main \
  "Update the right sidebar per PLAN_PROJECTS_WORKSPACES_TABS.md: it must contain only Changes + Files and be scoped to the opened workspace (not the selected tab). Remove terminals from the right sidebar entirely. Replace file explorer client actions/state to use the new workspace-scoped RPC (no agentId). Ensure empty workspaces still work. Typecheck."
)
echo \"$APP_EXPLORER_ID\"
```

## 2) Wait for completion

```bash
npm run -s cli -- wait "$SERVER_ID"
npm run -s cli -- wait "$APP_TABS_ID"
npm run -s cli -- wait "$APP_SIDEBAR_ID"
npm run -s cli -- wait "$APP_EXPLORER_ID"
```

## 3) Collect diffs from each worktree

```bash
SERVER_CWD=$(npm run -s cli -- inspect "$SERVER_ID" --json | jq -r '.cwd')
APP_TABS_CWD=$(npm run -s cli -- inspect "$APP_TABS_ID" --json | jq -r '.cwd')
APP_SIDEBAR_CWD=$(npm run -s cli -- inspect "$APP_SIDEBAR_ID" --json | jq -r '.cwd')
APP_EXPLORER_CWD=$(npm run -s cli -- inspect "$APP_EXPLORER_ID" --json | jq -r '.cwd')

git -C "$SERVER_CWD" diff > /tmp/pwt-server.patch
git -C "$APP_TABS_CWD" diff > /tmp/pwt-app-tabs.patch
git -C "$APP_SIDEBAR_CWD" diff > /tmp/pwt-app-sidebar.patch
git -C "$APP_EXPLORER_CWD" diff > /tmp/pwt-app-explorer.patch
```

## 4) Integrate (apply patches in order)

Recommended: create a clean integration worktree/branch first, then apply patches.

```bash
# In a clean integration branch/worktree:
git apply /tmp/pwt-server.patch
git apply /tmp/pwt-app-tabs.patch
git apply /tmp/pwt-app-sidebar.patch
git apply /tmp/pwt-app-explorer.patch

npm run typecheck
```

If `git apply` fails due to overlap, apply one patch at a time and resolve manually, then re-run typecheck.

## 5) QA pass

- Verify acceptance criteria list in `PLAN_PROJECTS_WORKSPACES_TABS.md`.
- Smoke test navigation: open workspace → tabs → right sidebar → plus flow.
- Confirm no remaining agentId-based explorer/download usage.

