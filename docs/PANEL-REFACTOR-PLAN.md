# Panel Interface Refactor Plan

**Goal:** Replace the hardcoded panel switch statements with a registry-based panel interface. This is a pure refactor — all product surfaces stay identical. The motivation is to prepare for split panes (VSCode-style), where each split independently renders panels.

## The Problem

The workspace screen (`packages/app/src/screens/workspace/workspace-screen.tsx`, ~2084 lines) has a `renderContent()` function (line 1437) that switches on `target.kind` to render each panel type with bespoke props. The same pattern repeats in:

- `workspace-tab-model.ts` — switches on `target.kind` to build tab descriptors (labels, subtitles, status)
- `workspace-tab-presentation.tsx` — switches on kind for icons and status indicators

Every new panel type requires editing 3+ files. This must become a registry where panels self-register.

## Target Architecture

### 1. PanelRegistration Interface

```typescript
// panels/panel-registry.ts

interface PanelDescriptor {
  label: string;
  subtitle: string;
  titleState: "ready" | "loading";
  icon: React.ComponentType<{ size: number; color: string }>;
  statusBucket: SidebarStateBucket | null;
}

interface PanelRegistration<K extends WorkspaceTabTarget["kind"] = WorkspaceTabTarget["kind"]> {
  kind: K;
  component: React.ComponentType;
  useDescriptor(
    target: Extract<WorkspaceTabTarget, { kind: K }>,
    context: { serverId: string; workspaceId: string },
  ): PanelDescriptor;
  confirmClose?(
    target: Extract<WorkspaceTabTarget, { kind: K }>,
    context: { serverId: string; workspaceId: string },
  ): Promise<boolean>;
}
```

### 2. Panel Registry

```typescript
const panelRegistry = new Map<string, PanelRegistration>();

function registerPanel(registration: PanelRegistration): void {
  panelRegistry.set(registration.kind, registration);
}

function getPanelRegistration(kind: string): PanelRegistration | undefined {
  return panelRegistry.get(kind);
}
```

### 3. PaneContext

Every panel gets workspace-level context via `usePaneContext()`. No prop drilling of serverId/workspaceId through panel-specific props.

```typescript
interface PaneContextValue {
  serverId: string;
  workspaceId: string;
  tabId: string;
  target: WorkspaceTabTarget;
  openTab(target: WorkspaceTabTarget): void;
  closeCurrentTab(): void;
  retargetCurrentTab(target: WorkspaceTabTarget): void;
  openFileInWorkspace(filePath: string): void;
}
```

### 4. WorkspaceTabTarget stays unchanged

```typescript
type WorkspaceTabTarget =
  | { kind: "draft"; draftId: string }
  | { kind: "agent"; agentId: string }
  | { kind: "terminal"; terminalId: string }
  | { kind: "file"; path: string };
```

No store migration needed. `serverId` and `workspaceId` come from the pane context, not the target.

## Panel Implementations

Each panel type gets its own file that exports a `PanelRegistration`. Panels use `usePaneContext()` for workspace-level context and read their own data from stores directly.

### Agent Panel Example

```typescript
// panels/agent-panel.ts

function useAgentPanelDescriptor(
  target: { kind: "agent"; agentId: string },
  context: { serverId: string },
): PanelDescriptor {
  const agent = useSessionStore(
    (s) => s.agentsByServer.get(context.serverId)?.get(target.agentId) ?? null,
  );
  const provider = agent?.provider ?? "codex";
  const label = resolveAgentLabel(agent?.title);
  return {
    label: label ?? "",
    subtitle: `${formatProviderLabel(provider)} agent`,
    titleState: label ? "ready" : "loading",
    icon: agentIconForProvider(provider),
    statusBucket: agent ? deriveAgentStatusBucket(agent) : null,
  };
}

function AgentPanel() {
  const { serverId, target, openFileInWorkspace } = usePaneContext();
  invariant(target.kind === "agent", "AgentPanel requires agent target");
  return (
    <AgentReadyScreen
      serverId={serverId}
      agentId={target.agentId}
      showExplorerSidebar={false}
      wrapWithExplorerSidebarProvider={false}
      onOpenWorkspaceFile={openFileInWorkspace}
    />
  );
}

export const agentPanelRegistration: PanelRegistration<"agent"> = {
  kind: "agent",
  component: AgentPanel,
  useDescriptor: useAgentPanelDescriptor,
  async confirmClose(target, context) {
    const agent = useSessionStore.getState().agentsByServer.get(context.serverId)?.get(target.agentId);
    if (agent?.status === "running") {
      return confirmDialog({ title: "Agent is still running. Close anyway?" });
    }
    return true;
  },
};
```

### Terminal Panel Example

```typescript
function useTerminalPanelDescriptor(
  target: { kind: "terminal"; terminalId: string },
  _context: { serverId: string; workspaceId: string },
): PanelDescriptor {
  // read terminal data from appropriate store
  return {
    label: "Terminal",
    subtitle: "Terminal",
    titleState: "ready",
    icon: TerminalIcon,
    statusBucket: null,
  };
}

function TerminalPanel() {
  const { serverId, workspaceId, target, openTab } = usePaneContext();
  invariant(target.kind === "terminal", "TerminalPanel requires terminal target");
  return (
    <TerminalPane
      serverId={serverId}
      cwd={workspaceId}
      selectedTerminalId={target.terminalId}
      onSelectedTerminalIdChange={(terminalId) => {
        if (terminalId) {
          openTab({ kind: "terminal", terminalId });
        }
      }}
      hideHeader
      manageTerminalDirectorySubscription={false}
    />
  );
}
```

### Draft Panel Example

```typescript
function useDraftPanelDescriptor(
  _target: { kind: "draft"; draftId: string },
  _context: { serverId: string; workspaceId: string },
): PanelDescriptor {
  return {
    label: "New Agent",
    subtitle: "New Agent",
    titleState: "ready",
    icon: PencilIcon,
    statusBucket: null,
  };
}

function DraftPanel() {
  const { serverId, workspaceId, tabId, target, openFileInWorkspace, retargetCurrentTab } = usePaneContext();
  invariant(target.kind === "draft", "DraftPanel requires draft target");
  return (
    <WorkspaceDraftAgentTab
      serverId={serverId}
      workspaceId={workspaceId}
      tabId={tabId}
      draftId={target.draftId}
      onOpenWorkspaceFile={openFileInWorkspace}
      onCreated={(agentSnapshot) => {
        retargetCurrentTab({ kind: "agent", agentId: agentSnapshot.id });
      }}
    />
  );
}
```

### File Panel Example

```typescript
function useFilePanelDescriptor(
  target: { kind: "file"; path: string },
  _context: { serverId: string; workspaceId: string },
): PanelDescriptor {
  const fileName = target.path.split("/").filter(Boolean).pop() ?? target.path;
  return {
    label: fileName,
    subtitle: target.path,
    titleState: "ready",
    icon: FileTextIcon,
    statusBucket: null,
  };
}

function FilePanel() {
  const { serverId, workspaceId, target } = usePaneContext();
  invariant(target.kind === "file", "FilePanel requires file target");
  return (
    <FilePane
      serverId={serverId}
      workspaceRoot={workspaceId}
      filePath={target.path}
    />
  );
}
```

## How the Tab Bar Uses It

Each tab chip calls the panel's `useDescriptor` hook:

```typescript
function TabChip({ tabId, target, serverId, workspaceId }: {
  tabId: string;
  target: WorkspaceTabTarget;
  serverId: string;
  workspaceId: string;
}) {
  const registration = getPanelRegistration(target.kind);
  invariant(registration, `No panel registration for kind: ${target.kind}`);
  const descriptor = registration.useDescriptor(target, { serverId, workspaceId });
  return (
    <TabChipChrome
      tabId={tabId}
      label={descriptor.label}
      subtitle={descriptor.subtitle}
      titleState={descriptor.titleState}
      icon={<descriptor.icon size={16} color={theme.colors.foregroundMuted} />}
      statusBucket={descriptor.statusBucket}
    />
  );
}
```

## How the Workspace Screen Renders Content

Replaces the entire `renderContent()` switch:

```typescript
function PaneContent({ tabId, target, serverId, workspaceId }: {
  tabId: string;
  target: WorkspaceTabTarget;
  serverId: string;
  workspaceId: string;
}) {
  const registration = getPanelRegistration(target.kind);
  if (!registration) return null;
  const Component = registration.component;
  return (
    <PaneProvider value={{ serverId, workspaceId, tabId, target, ...actions }}>
      <Component />
    </PaneProvider>
  );
}
```

## Implementation Steps

### Step 1: Create panel registry infrastructure

Create the following new files:

- `packages/app/src/panels/panel-registry.ts` — `PanelRegistration`, `PanelDescriptor` types, registry map, `registerPanel()`, `getPanelRegistration()`
- `packages/app/src/panels/pane-context.ts` — `PaneContextValue` type, React context, `PaneProvider`, `usePaneContext()` hook

### Step 2: Create panel registration files

Move panel-specific logic out of workspace-screen, workspace-tab-model, and workspace-tab-presentation into self-contained panel modules:

- `packages/app/src/panels/agent-panel.ts` — agent component wrapper + `useDescriptor` + `confirmClose`
- `packages/app/src/panels/draft-panel.ts` — draft component wrapper + `useDescriptor`
- `packages/app/src/panels/terminal-panel.ts` — terminal component wrapper + `useDescriptor`
- `packages/app/src/panels/file-panel.ts` — file component wrapper + `useDescriptor`
- `packages/app/src/panels/register-panels.ts` — imports all panels, calls `registerPanel()` for each

### Step 3: Refactor workspace-tab-model.ts

Replace the per-kind descriptor derivation in `deriveWorkspaceTabModel()` with calls to `getPanelRegistration(target.kind).useDescriptor(...)`.

Note: `deriveWorkspaceTabModel` is a pure function, not a hook. The `useDescriptor` hooks are called from React components (the tab bar). The model derivation may need to be restructured — the tab bar calls `useDescriptor` per tab, and the model just handles ordering and active-tab resolution.

### Step 4: Refactor workspace-screen.tsx renderContent()

Replace the `renderContent()` switch with `<PaneContent>` that uses the registry. Wire up the `PaneProvider` with the action callbacks that currently live as inline functions in the workspace screen.

### Step 5: Refactor workspace-tab-presentation.tsx

Move icon components and status derivation into each panel's registration. The shared `WorkspaceTabIcon` component becomes a thin wrapper that calls `registration.useDescriptor()` and renders the icon from the descriptor.

### Step 6: Verify

- `npm run typecheck` must pass
- All existing tab behavior must work identically: open, close, reorder, retarget, keyboard shortcuts, context menus
- Mobile tab switcher must work unchanged
- No visual regressions in tab bar, icons, status indicators

## Constraints

- **Pure refactor** — zero user-visible behavior changes
- **No new features** — no splits, no new panel types, no new keyboard shortcuts
- **WorkspaceTabTarget stays unchanged** — no store migration
- **workspace-tabs-store.ts stays unchanged** — the store is not part of this refactor
- **Do not create index.ts barrel files** — project convention
- **Use `invariant` from `tiny-invariant`** for asserting panel target kinds
- **Use `function` declarations** — project convention (no arrow function components)
- **Use `interface` over `type` where possible** — project convention
- **Run `npm run typecheck` after every change** — project rule
