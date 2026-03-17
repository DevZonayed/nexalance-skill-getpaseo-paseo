# Split Panes Plan

**Goal:** VSCode-style split panes for the workspace screen. Users can drag tabs to edges to create horizontal/vertical splits, resize splits, and navigate between panes with keyboard shortcuts. Desktop/web only — mobile uses the same store but never creates splits (single pane).

## Data Model

### Core Types

```typescript
interface SplitPane {
  id: string;
  tabIds: string[];
  focusedTabId: string | null;
}

interface SplitGroup {
  id: string;
  direction: "horizontal" | "vertical";
  children: SplitNode[];
  sizes: number[];  // proportional, sum to 1, same length as children
}

type SplitNode =
  | { kind: "pane"; pane: SplitPane }
  | { kind: "group"; group: SplitGroup };

interface WorkspaceLayout {
  root: SplitNode;
  focusedPaneId: string;
}
```

### Design Decisions

- **Single store replaces the flat tab store.** The layout store owns tabs, tab order (per pane), and focused tab (per pane). No separate flat tab store.
- **Mobile is just a single-pane tree.** Same store, same code paths. Mobile never calls split operations, so the tree never grows beyond one pane.
- **Focused pane concept.** Common operations (`openTab`, `closeTab`, `focusTab`) route to the focused pane automatically. No `paneId` parameter needed for everyday use.
- **`PaneContext` doesn't need `paneId`.** Split-specific operations (drag-drop, resize) are wired directly in split UI components that know their pane ID from tree rendering.
- **Max depth: 4 levels.**
- **Proportional sizes** that sum to 1. Minimum proportion per child: 0.1 (10%).

### Default State

Every workspace starts with:

```typescript
{
  root: { kind: "pane", pane: { id: "main", tabIds: [], focusedTabId: null } },
  focusedPaneId: "main",
}
```

### Migration

Version 6 migration from the current flat tab store. Wraps existing `tabIds`, `tabOrder`, and `focusedTabId` into a single-pane tree.

## Store Actions

### Everyday Operations (pane-agnostic)

These don't take a `paneId`. Mobile code only uses these.

```typescript
openTab(workspaceKey: string, target: WorkspaceTabTarget): string | null;
closeTab(workspaceKey: string, tabId: string): void;
focusTab(workspaceKey: string, tabId: string): void;
retargetTab(workspaceKey: string, tabId: string, target: WorkspaceTabTarget): string | null;
reorderTabs(workspaceKey: string, tabIds: string[]): void;  // within focused pane
getWorkspaceTabs(workspaceKey: string): WorkspaceTab[];      // all tabs across all panes
```

- `openTab` creates the tab and adds it to the focused pane.
- `closeTab` finds the tab in any pane, removes it. If that was the last tab in the pane, collapses the pane.
- `focusTab` finds the tab in any pane, focuses it and focuses that pane.

### Split Operations (desktop only)

```typescript
splitPane(workspaceKey: string, input: {
  tabId: string;
  targetPaneId: string;
  position: "left" | "right" | "top" | "bottom";
}): string | null;  // new pane ID, or null if depth cap hit

moveTabToPane(workspaceKey: string, tabId: string, toPaneId: string): void;
focusPane(workspaceKey: string, paneId: string): void;
resizeSplit(workspaceKey: string, groupId: string, sizes: number[]): void;
reorderTabsInPane(workspaceKey: string, paneId: string, tabIds: string[]): void;
```

## Tree Transformations

### splitPane

**Position mapping:**
- `left` / `right` → `horizontal` direction
- `top` / `bottom` → `vertical` direction
- `left` / `top` → new pane inserted before target
- `right` / `bottom` → new pane inserted after target

**Optimization:** If the target pane's parent group has the same direction, insert as a sibling into that group instead of nesting. This keeps the tree flat.

```
Before: horizontal([A, B])
Split B right with tab X

Optimized: horizontal([A, B, C])       ← insert into existing group
Naive:     horizontal([A, horizontal([B, C])])  ← wastes depth
```

**Steps:**
1. Check depth — reject if would exceed 4 levels
2. Remove `tabId` from source pane (could be same or different pane)
3. Create new pane: `{ id: generateId(), tabIds: [tabId], focusedTabId: tabId }`
4. If parent group has same direction → insert new pane adjacent to target in parent's children, split target's size proportion 50/50 between target and new pane
5. Else → replace target node with new group `{ direction, children: [target, newPane], sizes: [0.5, 0.5] }` (order based on position)
6. If source pane is now empty → collapse it
7. Set `focusedPaneId` to new pane

### collapsePane

Triggered when a pane's last tab is removed or moved out.

```
Before: horizontal([A, B, C]) sizes [0.3, 0.4, 0.3]
B loses last tab

After:  horizontal([A, C]) sizes [0.5, 0.5]  (renormalized)
```

**Steps:**
1. Remove pane from parent group's children
2. Remove corresponding entry from parent's sizes
3. Renormalize sizes to sum to 1
4. If parent group now has 1 child → unwrap: replace group with its single remaining child
5. Unwrap can cascade up the tree
6. Move focus to nearest sibling

### moveTabToPane

Tab dragged from one pane to another existing pane.

1. Remove `tabId` from source pane's `tabIds`
2. Insert into target pane's `tabIds` at drop position (or end)
3. Set target pane's `focusedTabId` to the moved tab
4. If source pane is now empty → collapsePane
5. Set `focusedPaneId` to target pane

### resizeSplit

User drags a divider between panes.

1. Find group by ID
2. Update the two adjacent sizes based on drag delta
3. Clamp each child to minimum proportion (0.1)
4. Renormalize so sizes sum to 1

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Split right | `Cmd+\` |
| Split down | `Cmd+Shift+\` |
| Focus pane left | `Cmd+Shift+←` |
| Focus pane right | `Cmd+Shift+→` |
| Focus pane up | `Cmd+Shift+↑` |
| Focus pane down | `Cmd+Shift+↓` |
| Move tab to pane left | `Cmd+Shift+Alt+←` |
| Move tab to pane right | `Cmd+Shift+Alt+→` |
| Move tab to pane up | `Cmd+Shift+Alt+↑` |
| Move tab to pane down | `Cmd+Shift+Alt+↓` |
| Close pane | `Cmd+Shift+W` |

Existing tab shortcuts unchanged — `Cmd+T`, `Cmd+W`, `Alt+Shift+[/]`, `Alt+1-9` — they operate on the focused pane's tabs.

## Drag and Drop UX

### Drop Zones

When dragging a tab over a pane, the pane is divided into 5 drop zones:
- **Center** (inner 40%) — move tab to this pane (add to existing tab list)
- **Left edge** (leftmost 15%) — split left
- **Right edge** (rightmost 15%) — split right
- **Top edge** (topmost 15%) — split up
- **Bottom edge** (bottommost 15%) — split down

### Overlay Preview

On hover over a drop zone, show a semi-transparent overlay rectangle covering the half of the pane where the new split would appear. The overlay uses the theme's accent color at low opacity.

### Cross-Pane Tab Drag

Tabs can be dragged:
- Within a pane's tab bar → reorder (existing behavior via SortableInlineList)
- From one pane's tab bar to another pane's tab bar → move tab to that pane
- From a tab bar to a pane's drop zone → split

When dragging the last tab out of a pane, the pane collapses after the drop completes.

## Implementation Steps

### Step 1: Layout Store

Create `packages/app/src/stores/workspace-layout-store.ts`:
- `WorkspaceLayout`, `SplitNode`, `SplitPane`, `SplitGroup` types
- Zustand store with AsyncStorage persistence
- Everyday actions: `openTab`, `closeTab`, `focusTab`, `retargetTab`, `reorderTabs`
- Tree helpers: `findPaneById`, `findPaneContainingTab`, `getTreeDepth`, `collectAllTabs`
- Version 6 migration from flat tab store

### Step 2: Migrate Workspace Screen to Layout Store

Replace all `useWorkspaceTabsStore` usage in workspace-screen with the new layout store. Mobile and desktop both use the layout store — mobile just never splits. All existing behavior preserved.

### Step 3: Split Tree Transformations

Add to the layout store:
- `splitPane` with the parent-direction optimization and depth check
- `collapsePane` with unwrap cascading
- `moveTabToPane`
- `resizeSplit`

Pure tree transformation functions, tested independently.

### Step 4: Split Container Component

Create `packages/app/src/components/split-container.tsx`:
- Recursive component that renders `SplitNode`
- Groups render as flex containers with direction from `SplitGroup.direction`
- Panes render tab bar + active panel content (using the panel registry)
- Resize handles between children of a group

### Step 5: Drop Zones and Overlay

Create `packages/app/src/components/split-drop-zone.tsx`:
- Overlay that appears during tab drag
- Divides pane into 5 zones (center + 4 edges)
- Shows preview rectangle on hover
- Calls `splitPane` or `moveTabToPane` on drop

### Step 6: Cross-Pane Drag

Extend the existing dnd-kit setup:
- Tab bar items remain draggable (existing)
- Pane drop zones become droppable targets
- Tab bar of other panes become droppable targets (move to pane)
- DndContext wraps the entire split container (not individual panes)

### Step 7: Keyboard Shortcuts

Register new actions in `keyboard/actions.ts`:
- `workspace.pane.split.right`, `workspace.pane.split.down`
- `workspace.pane.focus.left/right/up/down`
- `workspace.pane.move-tab.left/right/up/down`
- `workspace.pane.close`

Add bindings in `keyboard-shortcuts.ts` and handlers in the workspace screen.

### Step 8: Pane Focus Navigation

Implement spatial navigation for `focus.left/right/up/down`:
- Walk the tree to find the focused pane's position in the layout
- Find the nearest pane in the requested direction
- Focus it

Same logic for `move-tab` shortcuts — find adjacent pane, call `moveTabToPane`.

## Constraints

- Mobile stays single-pane — same store, no special casing
- Max 4 levels of nesting
- Minimum pane size: 10% of parent
- `PaneContext` interface unchanged — no `paneId` added
- Panel registry unchanged — panels don't know about splits
- Existing tab shortcuts work on focused pane, unchanged
