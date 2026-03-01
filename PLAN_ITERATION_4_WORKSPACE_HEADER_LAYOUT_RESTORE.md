# Iteration 4 — Workspace header/layout restore (tabs + explorer parity)

## Goal

Fix regressions introduced by the workspace-tabs migration by restoring the **legacy workspace/agent screen layout and gestures**, while keeping the new **workspace tab model** (agent + terminal tabs).

This iteration focuses on **header controls + panel layout parity**, and fixing the broken **New tab** menu on desktop.

## Context (what must remain true)

- **Left sidebar** stays as-is (projects/workspaces list) and keeps existing swipe/gesture behavior.
- **Right sidebar** stays as-is (Changes/Files explorer) and keeps existing swipe/gesture behavior.
- **Terminals and agents are first-class tabs**:
  - Terminal tabs are not “special” or in a different layout region.
  - New tab creation UI must treat agent + terminal options equally (same menu surface).
- Workspace header shows **workspace name (branch name when git, otherwise workspace name)**.
- No “legacy view” routing or duplicate UI kept around; everything uses the new workspace-tabs flow.
- Do **not** touch/restart the main daemon on `:6767`. Tests/dev servers must use isolated ports/homes.

## UX Requirements (desktop + mobile)

### Header structure (parity with legacy AgentReadyScreen)

Workspace screen header must include:

1) **Left sidebar toggle** (same component/gesture behavior as before).
2) **Title** = branch name if git & branch is known; otherwise workspace name.
3) **Right explorer toggle** (same behavior as before):
   - Desktop icon: panel/right icon
   - Mobile icon: `GitBranch` if git checkout, else `Folder`
   - Correct `aria-expanded` state and open/closed coloring
4) **New tab** dropdown button that reliably opens on-screen (desktop + mobile).
5) **Overflow (kebab / 3-dot) menu for agent chat**:
   - Visible only when the active tab is an **agent** (i.e. “chat context”).
   - Menu items should mirror legacy intent (at minimum: open chat view with full header).

### Tabs

- Tabs remain horizontally scrollable (browser-style).
- Tabs must include an icon per tab type:
  - Agent tabs show provider icon (Claude/Codex; fallback bot).
  - Terminal tabs show terminal icon.
- Tabs must support closing terminal tabs via `X` (desktop):
  - Confirm destructive close.
  - Killing terminal updates the list and selects a valid remaining tab (or falls back to workspace root).

### Panel layout

- Keep the screen layout: **header → tabs row → content center → explorer right panel**.
- Do not nest the explorer UI inside tab content in a way that changes layout/gesture wiring.

### Gestures (must not regress)

- Left sidebar open/close gestures unchanged.
- Explorer (right sidebar) open/close gestures unchanged.
- Mobile “open explorer” pan gesture on content remains wired the same as before.

## Acceptance Criteria

### New tab dropdown

- Clicking the `New tab` header button opens a dropdown that is **visible on-screen** on desktop (not positioned off-screen).
- Dropdown contains **two options**:
  - Agent tab → opens draft agent flow for that workspace.
  - Terminal tab → creates a terminal and opens its tab.

### Workspace header parity

- Header shows both sidebar toggles (left menu + right explorer toggle).
- Right explorer toggle icon matches legacy behavior:
  - Mobile: git vs folder icon
  - Desktop: panel-right icon
- Explorer toggle opens/closes the explorer reliably and updates `aria-expanded`.

### Agent kebab menu

- When an agent tab is active, the kebab menu is visible and opens correctly.
- When a terminal tab is active, the kebab menu is not shown.

### Tab close

- Terminal tabs display an `X` close affordance on desktop (hover or active).
- Closing a terminal:
  - Confirms close
  - Calls kill terminal RPC
  - Removes the tab from the list
  - Focuses a valid remaining tab (or navigates to workspace root if none)

### Regression checks

- Explorer panel remains on the right and behaves the same as before (including gestures).
- Left sidebar gestures remain unchanged.

## Verification

### Automated

- `npm run typecheck` (must pass)
- `npm run test --workspace=@getpaseo/app` (must pass)
- Playwright E2E:
  - Add/ensure a spec that asserts `New tab` dropdown opens and is within the viewport.
  - Add/ensure a spec that toggles explorer via header button and asserts open/close.

### Manual (agent-browser)

Desktop (Metro web):
- Confirm header shows: left toggle, title, explorer toggle, `New tab` dropdown, kebab menu (agent only).
- Confirm `New tab` dropdown opens and is visible.
- Confirm terminal tab shows `X` close and closes correctly.

Mobile viewport (Metro web responsive):
- Confirm explorer toggle uses git/folder icon.
- Confirm swipes/gestures for sidebars still work.

## Non-goals (explicitly out of scope for this iteration)

- Panel splitting / drag-to-split implementation (architectural compatibility only).
- New workspace creation UX, workspace archiving rules beyond existing behavior.
- Agent hydration/indexing redesign (local SQL DB) beyond current in-memory hydration.

