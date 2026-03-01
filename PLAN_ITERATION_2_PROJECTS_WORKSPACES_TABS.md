# Iteration 2 — Projects → Workspaces → Tabs (UX Polish + Behavior Fixes)

This plan is a follow-up iteration on the already-merged “Projects → Workspaces → Tabs” redesign.

Scope is **client-only UX/behavior fixes** requested after manual testing.

---

## Goals (What changes in this iteration)

### 1) Sidebar drag behavior (Projects + Workspaces)

- **Project drag moves the whole section**
  - Dragging a **project heading** reorders the **entire project section** (heading + its workspaces), even when expanded.
- **Workspace drag is scoped**
  - Dragging a **workspace** only reorders **within its project**.
  - A workspace must **never end up visually under another project** after drop.
- **No “invalid” intermediate layouts**
  - If a drag results in a transient invalid arrangement (e.g., a workspace visually dropped between projects), the list must **snap back** to the canonical `Project → Workspaces` structure immediately after drop.

### 2) Sidebar visuals + navigation polish

- **Workspace rows match project row styling**
  - Remove the “weird border” on workspaces.
  - Workspace rows should follow the same “ghost”/hover/pressed style language as project headings.
- **Reduce workspace indentation/padding**
  - Workspaces are currently too indented; reduce indent, especially on mobile.
- **Remove noisy “No agents yet” label**
  - Empty workspaces are valid; do not display a “No agents yet” label anywhere in the sidebar tree.
- **Workspace click closes sidebar (mobile)**
  - When tapping a workspace from the left sidebar on mobile, the sidebar closes before navigation.

### 3) Workspace header + tab bar fixes

- **Workspace header title is the branch name**
  - For git workspaces, the header must show the **current branch name**, including the base branch (e.g., `main`).
  - For non-git workspaces, fall back to workspace name.
- **Agents and terminals are first-class tab types**
  - Remove “special layout” treatment where agents and terminals have creation controls on different rows.
  - Provide a **single unified “New tab” control** that can create either:
    - **New agent** (draft agent flow, pre-scoped to the workspace)
    - **New terminal** (create terminal tab)
- **Agent tabs show provider icons**
  - Terminal tabs: terminal icon.
  - Agent tabs: provider icon (at minimum: **Claude/cloud** + **Codex** using existing app icon assets/components).
- **Remember focused tab per workspace (critical)**
  - If a user focuses an agent/terminal tab in Workspace A, switches to Workspace B, and returns to Workspace A, the app must restore the previously focused tab.
  - This must work even if the agent/terminal lists are still loading (do not overwrite the stored selection with a fallback while data is pending).

---

## User Flows (Agreed / Required)

### Sidebar

1. User opens left sidebar.
2. User expands a project to reveal workspaces.
3. User drags a project header:
   - Project moves relative to other projects.
   - All its workspaces remain grouped with it.
4. User drags a workspace:
   - Only reorders within its project.
   - Cannot be dropped into another project section.
5. User taps a workspace on mobile:
   - Sidebar closes.
   - Workspace screen opens with branch name in header.

### Workspace screen

1. User opens a workspace.
2. User can switch between agent and terminal tabs.
3. User uses the unified “New tab” control to create either:
   - a new agent (draft flow), or
   - a new terminal
4. User switches to a different workspace and returns:
   - The previously focused tab is restored.

---

## Acceptance Criteria (Strict)

### Sidebar drag behavior

- Dragging a project heading reorders projects, and after drop **the project heading is never separated from its own workspaces**.
- Dragging a workspace can only reorder within its project; after drop **a workspace is never displayed under another project**.
- After any drag, the sidebar tree snaps back to valid `Project → Workspaces` grouping (no “interleaved” layout remains).

### Sidebar visuals + navigation

- Workspace rows have **no border** and visually match the “ghost” style language of project headings.
- Workspace indentation/padding is reduced (especially mobile).
- “No agents yet” is **not rendered anywhere** in the sidebar tree.
- Clicking a workspace on mobile closes the left sidebar before navigation.

### Workspace header + tabs

- Git workspace header shows **branch name**, including base branch (e.g., `main`).
- There is **one unified “New tab” control** (not separate rows for agent vs terminal creation).
- Agent tabs show provider icons (Claude/Codex at minimum).
- Focused tab is restored when returning to a workspace (agent or terminal), and stored selection is not overwritten while lists are loading.

---

## Implementation Plan (Code)

### A) Sidebar drag scoping + snap-back

Target file(s):
- `packages/app/src/components/sidebar-agent-list.tsx`

Work:
- Ensure drag end always triggers a re-render that restores the canonical `Project → Workspaces` structure (even if persisted order does not change).
- Ensure reorder persistence remains:
  - projects: device store project order
  - workspaces: device store per-project workspace order

### B) Sidebar styling + labels

Target file(s):
- `packages/app/src/components/sidebar-agent-list.tsx`

Work:
- Remove the “No agents yet” createdAt label for empty workspaces (render empty/omitted createdAt instead).
- Align workspace row visuals with project row:
  - remove border
  - adjust padding
  - reduce indentation (responsive: tighter on mobile)

### C) Workspace screen: header title + unified “New tab”

Target file(s):
- `packages/app/src/screens/workspace/workspace-screen.tsx`

Work:
- Header title uses branch name for git checkouts (including base branch).
- Replace separate “Create agent” vs “Create terminal” placement with one unified “New tab” control.

### D) Workspace screen: provider icons + tab persistence

Target file(s):
- `packages/app/src/screens/workspace/workspace-screen.tsx`
- (potentially) `packages/app/src/stores/workspace-tabs-store.ts`

Work:
- Agent tab icons render provider icon (Claude/Codex).
- Fix tab restore so requested/stored tabs are respected while data loads:
  - do not redirect away from a requested tab just because lists haven’t populated yet
  - do not overwrite stored tab selection with fallback while queries are pending

---

## Verification Plan

### Automated

```bash
npm run typecheck
npm run test --workspace=@getpaseo/app
```

### Manual (agent-browser)

Using Metro web at `http://localhost:8081`:

1. Sidebar drag:
   - Expand a project, drag its heading above/below another project → confirm its workspaces stay grouped.
   - Drag a workspace “across” another project → confirm after drop it remains under original project.
2. Sidebar UI:
   - Confirm workspace rows have no border and are less indented.
   - Confirm no “No agents yet” labels.
   - On mobile breakpoint, tap a workspace → sidebar closes.
3. Workspace tabs:
   - Confirm header shows branch name (including `main`).
   - Confirm agent tabs show provider icons (Claude/Codex).
   - Confirm there is one unified “New tab” control for both agent + terminal.
   - Focus a terminal tab, switch to another workspace, switch back → terminal tab restored.

---

## Non-goals

- No panel splitting implementation (just keep architecture compatible).
- No server protocol changes (daemon stays untouched on `:6767`).
- No additional persistence beyond what’s required to satisfy “remember focused tab”.

