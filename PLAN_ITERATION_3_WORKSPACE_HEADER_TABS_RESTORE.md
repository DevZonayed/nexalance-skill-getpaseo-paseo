# Iteration 3 Plan — Workspace Header + Tabs Restore

## Goal

Bring the `Workspace` screen layout back in line with the pre-tabs “Agent screen” structure (left sidebar + center content + right explorer sidebar), while keeping the new **workspace-scoped tabs** model (Agent + Terminal tabs) and the **project → workspaces** sidebar.

This iteration focuses on restoring missing/incorrect UX affordances:

- **New tab** dropdown must open and be visible.
- **Right explorer sidebar** must be togglable from the workspace header (with the correct icon behavior).
- **Chat overflow (kebab) menu** must exist again when an Agent tab is active.
- **Terminal tabs** must be closable from the workspace tab strip (X), since terminals are first-class tabs.
- **Gestures** for opening/closing sidebars must remain unchanged.

## Non‑Goals (for this iteration)

- Panel splitting / VS Code-style split views (explicitly deferred).
- Changing the existing left sidebar open/close gestures or right explorer swipe gestures (must remain behaviorally identical).
- Introducing a DB / rehydration changes (agent hydration is already handled at startup).

## Acceptance Criteria

### A. New Tab menu

1. Clicking **New tab** in the workspace header opens a visible dropdown/menu on desktop web.
2. The menu contains exactly:
   - **Agent tab** → navigates to the draft agent flow pre-scoped to the current workspace.
   - **Terminal tab** → creates a new terminal for the current workspace and focuses it.
3. The menu placement is correct (not off-screen), following established in-app patterns.

### B. Workspace header parity (restored controls)

1. Workspace header shows **workspace name = branch name** (as already implemented).
2. Header contains:
   - Left sidebar toggle (existing)
   - Right explorer sidebar toggle (restored)
   - Chat overflow **kebab menu** (restored) when an Agent tab is active
3. Right explorer toggle icon matches legacy behavior:
   - On mobile: **Git** workspace → Git icon; non-git → Folder icon
   - Visual “open” state is reflected (muted vs active color).

### C. Tabs UX parity

1. Desktop workspace tab strip:
   - Shows provider icon for Agent tabs (Claude/Codex) and terminal icon for Terminal tabs.
   - Terminal tabs include an **X** close affordance.
2. Closing a terminal tab:
   - Calls the existing kill terminal API
   - Removes the terminal from the workspace tab strip
   - Leaves the workspace in a valid focused state (falls back to another available tab).

### D. Right explorer sidebar structure & gestures (no regressions)

1. Explorer sidebar is the same **right panel** conceptually as before:
   - Not embedded “inside” the tab content surface
   - Toggled by header button and swipe gesture on mobile
2. Gestures remain unchanged:
   - Left sidebar: swipe right to open (mobile), swipe left/backdrop to close
   - Right sidebar: swipe left to open (mobile), swipe right/backdrop/X to close

### E. Verification gates

1. `npm run typecheck` passes.
2. `npm run test --workspace=@getpaseo/app` (vitest) passes.
3. Playwright E2E:
   - Add/update a spec that proves New tab menu opens and is on-screen.
   - Add/update a spec that toggles the explorer sidebar from the workspace header.
   - Run `npm run test:e2e --workspace=@getpaseo/app` (uses isolated daemon/metro; must NOT hit `:6767`).
4. Manual verification with `agent-browser` (desktop + mobile viewport) confirms:
   - New tab menu visible and clickable
   - Explorer toggle present and works
   - Kebab menu present for Agent tab
   - Terminal close X works

## Implementation Outline

### 1) Workspace header composition

- Refactor `packages/app/src/screens/workspace/workspace-screen.tsx` header to match the legacy “agent header” affordances:
  - Use the same header primitives used by `AgentReadyScreen` (`MenuHeader`, `HeaderToggleButton`, `DropdownMenu`).
  - Restore explorer toggle button in the workspace header.
  - Restore agent kebab menu (only when active tab is an Agent tab).

### 2) New tab dropdown placement fix

- Ensure the New tab dropdown uses a pattern that cannot render off-screen near the top of the viewport:
  - Prefer the existing header-menu pattern (DropdownMenu), or
  - If using Combobox, set an explicit `desktopPlacement` that renders below the trigger.

### 3) Terminal tab close affordance

- Add close (X) for terminal tabs in the workspace tab strip.
- Implement a minimal kill-terminal mutation in `WorkspaceScreen` (mirroring the existing `TerminalPane` mutation behavior) and ensure focus fallback.

### 4) E2E coverage

- Add `packages/app/e2e/workspace-tabs-header.spec.ts` (or similar) covering:
  - New tab menu opening (visible on screen)
  - Explorer toggle presence + open/close behavior

## User Flows (must work)

1. **Open workspace**
   - Tap workspace in sidebar → sidebar closes → workspace screen opens
   - Header shows branch name

2. **Open new terminal tab**
   - Header → New tab → Terminal tab
   - Terminal appears as a tab (with terminal icon)
   - Terminal is focused

3. **Close terminal tab**
   - Click X on terminal tab
   - Terminal is killed and disappears from tab strip
   - Focus returns to another tab

4. **Toggle explorer**
   - Header right icon toggles right sidebar
   - Mobile swipe gesture still opens the right sidebar

5. **Agent overflow menu**
   - With an Agent tab active, kebab menu opens
   - Menu content appears (parity with previous agent overflow)

