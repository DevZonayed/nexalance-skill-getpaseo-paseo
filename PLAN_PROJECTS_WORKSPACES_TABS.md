# Projects → Workspaces → Tabs (Full-Stack Plan)

This plan replaces the current “agents list + single chat view” IA with:

- **Projects** (grouped by a stable `projectKey`)
- **Workspaces** per project (today: local Paseo worktrees + main checkout; future: cloud VM)
- A **workspace main view** that is a **tabbed panel** where each tab is either an **agent** chat or a **terminal**

No legacy UI is kept: we redirect and fully rework the current routes and RPCs that don’t make sense anymore.

---

## TL;DR

- **Sidebar** becomes **Projects → Workspaces**; still supports drag reorder (projects + workspaces) persisted on-device.
- **Project key**: **remote when available**; otherwise **local repo root / workspace root** (CWD fallback).
- **Workspaces**: show **main checkout + all Paseo worktrees**, including empty workspaces.
- **Main view**: opening a workspace shows a **tab bar** with **all agents in that workspace**; horizontally scrollable.
- **Tabs** are a discriminated union: `agent` or `terminal` (terminals are not special).
- **Right sidebar** stays **Changes + Files**, scoped to the current workspace; **terminals removed** from the right sidebar.
- **File Explorer RPC**: replace agent-scoped explorer/download-token RPC with **workspace-scoped** versions.
- **Agent data** is loaded once at daemon startup and kept queryable in-memory (no expensive directory rescans at runtime).
- **Splits**: not implemented now, but abstractions should not block future VSCode-style splits.

---

## Definitions & IDs

### Project

A **Project** is a grouping container keyed by `projectKey`.

**`projectKey` derivation (must match user decisions):**

1. If git remote is available: use normalized remote key (e.g. `remote:github.com/org/repo`).
2. Else (git with no remote OR not git): use the **workspace/repo root path** (local key).

Notes:
- For Paseo-owned worktrees, prefer grouping via the **shared repo root** when available (so multiple workspaces still group under one project even without a remote).
- For plain directories, the root path is the directory itself.

### Workspace

A **Workspace** is an environment you can “open” and run agents/terminals within.

Today:
- **Local main checkout** (the normal repo root) is a workspace and **cannot be archived**.
- **Local Paseo worktrees** are workspaces (including empty ones).

Future:
- Workspace could point to a **cloud VM** or other remote compute target.

Workspace identity:
- `workspaceId` should be stable and unique within a server.
- For local: derive from canonical absolute `workspaceRoot` (and/or from the worktree metadata id when we add one).

### Tab

Tabs are the only top-level “things” in the workspace main view.

**Discriminated union (locked):**

```ts
type WorkspaceTab =
  | { kind: "agent"; tabId: string; agentId: string }
  | { kind: "terminal"; tabId: string; terminalId: string }
```

Terminals are not special: they are just `kind: "terminal"` tabs.

### Panel (future splits)

We do **not** implement splits now. We still design tab/panel state so it can evolve into a layout model:

```ts
type PanelLayout =
  | { kind: "single"; panelId: string }
  // later: | { kind: "split"; direction: "row"|"column"; a: PanelLayout; b: PanelLayout; sizes: number[] }
```

For this milestone, `PanelLayout` is always `{ kind: "single" }`.

---

## UX (Agreed)

### Sidebar (Left)

- Shows **Projects** (project icon + name + status dot).
- Each project expands to show **Workspaces**.
- Workspaces list includes:
  - **Main checkout workspace** (always present, not archivable)
  - **All Paseo worktrees** for that project (show all, including empty workspaces)
- Workspace row shows:
  - **Branch name**
  - **Created at**
  - **No path**
- **Drag reorder**:
  - Projects reorder globally
  - Workspaces reorder within a project
  - Persisted on-device
- **No agents** are shown in the sidebar (agents live in tabs + in the All Agents list).

### Main View (Workspace)

- Opening a workspace shows a workspace-scoped screen.
- Top area contains a **tab bar** with all agent tabs in that workspace:
  - horizontally scrollable
  - switching tabs focuses the selected agent/terminal
- **Remember last focus**:
  - When returning to a workspace, restore the last focused tab (agent or terminal).
  - When opening a workspace for the first time: pick the most recent agent, else open the draft agent flow.

### Tabs + Icons

- Each tab type provides its own icon.
  - Terminal tabs: terminal icon.
  - Agent tabs: status icon (running/idle/needs-attention/error) or provider icon if needed.

### Right Sidebar (Explorer Sidebar)

- Remains **Changes + Files** only.
- Scope is the **workspace you are looking at**.
- Selection of agent/terminal tab does **not** change the right sidebar scope.
- Terminals are removed from the right sidebar entirely.
- Gestures/overlay behavior are unchanged (mobile).

### Mobile-specific

- Keep existing overlay sidebars and gestures unchanged.
- Use a **tab switcher** pattern (bottom sheet / switcher) for tab navigation.
- Header is simplified:
  - shows only workspace name (branch name)
  - has space for a **plus** button
- Plus button:
  - opens the **draft agent flow**, pre-scoped to the current workspace.

---

## Data Model (Client)

### On-device persisted state

Persist (per `serverId`):
- `projectOrder: projectKey[]`
- `workspaceOrderByProject: Record<projectKey, workspaceId[]>`
- `lastOpenedWorkspaceByProject: Record<projectKey, workspaceId>`
- `lastFocusedTabByWorkspace: Record<workspaceId, tabId>`
- `openTabsByWorkspace: Record<workspaceId, WorkspaceTab[]>` (optional; can be derived initially from agents/terminals list but should be persistable)

Default ordering:
- If no persisted order:
  - Projects sorted by `createdAt/firstSeenAt` (or by name as fallback)
  - Workspaces sorted by **createdAt** (locked decision)

### Derived view models

Compute:
- `projects[]` from workspace + checkout metadata
- `projectStatusDot` aggregated from agent statuses in all workspaces in that project
- `workspaceStatusDot` aggregated from agent statuses in that workspace

---

## Data Model (Server)

### Agents: load once, query often

Current pain:
- Hydrating agents by scanning directories is expensive.

Target behavior:
- On daemon startup, perform a single load/scan and build an in-memory index:
  - by `agentId`
  - by `workspaceRoot`
  - by `projectKey`
  - by status (running, attention, errored, etc.)
- No periodic rescans at runtime.
- When an agent is created/updated/removed, update the in-memory index incrementally.
- This aligns with the PID lock: we don’t support concurrent disk mutation anyway.
- Future: replace with local SQL DB, but not in this milestone.

### Workspaces (local)

Source of truth:
- Main checkout: derived from repo root / current connection cwd policy.
- Paseo worktrees: `paseo_worktree_list_*` plus metadata.

Worktree metadata needs `createdAt`:
- Add `createdAt` to Paseo worktree metadata (new version).
- Backfill for existing worktrees using filesystem stat of metadata file or worktree directory.

---

## RPC / Protocol Changes (Server ↔ App)

### Replace: File Explorer request (agent-scoped → workspace-scoped)

**Current (to remove):**
- `file_explorer_request` requires `agentId`.

**New (replacement; same message type name or updated schema, but old behavior removed):**
- `file_explorer_request` keyed by `workspaceId` (or `workspaceRoot`) instead of `agentId`.
- Requests can succeed even if there are **no agents** in the workspace (empty workspace is valid).

Rules:
- All explorer operations are rooted at `workspaceRoot`.
- Path traversal is prevented (no `..`, enforce prefix).

### Replace: File download token request (agent-scoped → workspace-scoped)

**Current (to remove):**
- `file_download_token_request` requires `agentId`.

**New:**
- `file_download_token_request` requires `workspaceId` (or `workspaceRoot`) and `path`.
- Token resolution is workspace-rooted with the same traversal protections.

### Worktree list RPC: include `createdAt`

Update `paseo_worktree_list_response` to include:
- `createdAt` (ISO string)
- `workspaceId` (optional if client can derive; preferred to include for stability)

Ensure the list includes:
- all Paseo worktrees for the requested repo/project
- enough info to render workspace row: branch name + createdAt

### Checkout lite payload: ensure it contains enough for project grouping

For workspace/project grouping on the client, ensure we have:
- `isGit`
- `remoteUrl` (nullable)
- `currentBranch`
- `isPaseoOwnedWorktree`
- `mainRepoRoot` (when worktree-owned)
- (optional) `repoRoot` for non-worktree git repos

---

## App Changes (packages/app)

### Routes

Replace/redirect:
- `/h/:serverId` should no longer redirect to “draft agent”; it should land on:
  - last opened workspace, or
  - a workspace picker (the new sidebar is the primary picker)
- `/h/:serverId/agent` and `/h/:serverId/agent/:agentId` are replaced with:
  - `/h/:serverId/workspace/:workspaceId` (main workspace screen)
  - `/h/:serverId/workspace/:workspaceId/draft-agent` (draft flow, pre-scoped)

No legacy route behavior remains; old routes redirect.

### Left Sidebar rewrite

Replace the current agent list sidebar with:
- Project list (icon + name + status dot)
- Nested workspace list (branch name + createdAt)
- Drag reorder persisted on-device

### Workspace screen

New top-level screen composition:
- Header: workspace name (branch) + plus button
- Tab strip (horizontal)
- Active tab content (agent chat or terminal UI)
- Right sidebar: changes + file explorer (workspace-scoped)

### Tabs system

Implement `WorkspaceTab` union:
- `agent` tabs map to existing agent chat component (but now hosted within the workspace screen).
- `terminal` tabs map to existing terminal component previously shown in the right sidebar.

Remember focus:
- Persist `lastFocusedTabByWorkspace`.

### Terminal migration

- Remove terminal UI from right sidebar.
- Expose terminals through tabs:
  - create terminal -> adds a `terminal` tab
  - show terminal output in the main area

### File explorer state migration

Update file explorer client state/actions:
- Key state by `workspaceId` (not `agentId`).
- Update all call sites to use the new RPC parameters.

---

## Status Dots (Sidebar)

### Agent → Workspace → Project aggregation

Define a simple severity ordering, e.g.:

1. Error
2. Needs attention
3. Running
4. Idle / none

Compute:
- workspace status = max severity across agents in that workspace
- project status = max severity across all workspaces in that project

No agents are displayed in the sidebar; only aggregated signal.

---

## User Flows (Agreed)

### Open app → open a workspace

1. User opens app.
2. Left sidebar shows Projects.
3. User selects a Project.
4. User selects a Workspace (main checkout or a worktree).
5. Workspace screen opens:
   - tab strip shows all agents in that workspace
   - restores last focused tab if available
   - otherwise picks most recent agent
   - otherwise opens draft agent flow pre-scoped to the workspace

### Create a new agent in a workspace

1. User is inside a workspace.
2. User taps plus in header.
3. Draft agent flow opens, pre-scoped to that workspace root.
4. On create:
   - new agent appears as a new `agent` tab in the workspace
   - it becomes focused

### Open a terminal

1. User taps plus (or a “new tab” affordance).
2. Selects “Terminal”.
3. A `terminal` tab is created and focused.
4. Terminal is fully usable inside the tab panel.

### Switch tabs (mobile)

1. User opens tab switcher.
2. Selects an agent/terminal tab.
3. Workspace focuses that tab and persists focus.

### Reorder projects and workspaces

1. User drags a project to reorder.
2. Order persists on-device and survives app restart.
3. User expands a project and drags a workspace row to reorder within the project.
4. Order persists on-device and survives app restart.

---

## Acceptance Criteria

### Sidebar / Navigation

- Projects are grouped by `projectKey`:
  - remote when available
  - otherwise local repo/workspace root key
- Sidebar shows **project icon** for each project.
- Each project lists workspaces (main checkout + all Paseo worktrees), including empty workspaces.
- Workspace rows show **branch name + createdAt**, and **do not show path**.
- Projects and workspaces can be drag-reordered; order is persisted on-device.
- Sidebar does not list agents anywhere.

### Workspace main view

- Opening a workspace shows a tabbed main view (not a single chat screen).
- Tab bar contains all agents in the workspace; horizontally scrollable.
- Last focused tab is restored when returning to a workspace.
- Header shows workspace name and a plus button.
- Plus opens draft agent flow pre-scoped to workspace.
- Mobile uses a tab switcher; sidebars/gestures unchanged.

### Tabs / Terminals

- Tabs are a discriminated union: `agent` or `terminal`.
- Terminals are accessible only as tabs (no terminal section in the right sidebar).
- Each tab type can render a custom icon; agent tabs can render status.

### Explorer / Changes / Files

- Right sidebar contains only Changes + Files, scoped to the opened workspace.
- File explorer and download token requests are workspace-scoped (no agentId in protocol).
- File explorer works for empty workspaces (no agents yet).

### Migration / No legacy

- Old agent-centric routes redirect to the new workspace routes.
- Old agent-scoped file explorer RPC is removed/replaced (no legacy behavior left behind).

---

## Implementation Phases (Suggested)

### Phase 0 — Scaffolding

- Add shared types: `Project`, `Workspace`, `WorkspaceTab`.
- Add on-device storage keys and migration scaffolding (no UI yet).

### Phase 1 — Server protocol + data

- Replace file explorer + download token RPCs to be workspace-scoped.
- Ensure checkout-lite has enough fields for grouping.
- Add worktree `createdAt` and include it in worktree list response.
- Ensure “main checkout workspace” can be represented as a workspace.
- Ensure agent index loads once at startup and is queryable without rescans.

### Phase 2 — App navigation rewrite

- Introduce workspace routes and redirect old routes.
- Add new workspace screen layout (header + tabs + explorer sidebar).

### Phase 3 — Sidebar rewrite

- Implement Projects → Workspaces sidebar UI.
- Implement project icon wiring.
- Implement drag reorder + persisted ordering.
- Implement project/workspace status dots from agent status aggregation.

### Phase 4 — Tabs + terminals migration

- Implement tab state + last focused persistence.
- Move terminals out of right sidebar and into tabs.
- Implement mobile tab switcher.

### Phase 5 — Polish + verification

- Verify flows end-to-end (open workspace, tabs, explorer, plus flows).
- Confirm no legacy route/UI remains.
- Typecheck and targeted runtime smoke tests.

---

## Verification Checklist

- `npm run typecheck` passes after each phase.
- Explorer sidebar still behaves the same (gestures/overlay).
- No references remain to “file explorer by agentId” or “download token by agentId”.
- Terminals are not rendered in the right sidebar.
- Workspace list includes empty worktrees and main checkout.
- Reorder persistence works and survives app restart.

