import { Fragment, useCallback, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ResizeHandle } from "@/components/resize-handle";
import { SplitDropZone, type SplitDropZoneHover } from "@/components/split-drop-zone";
import { WorkspacePaneContent } from "@/screens/workspace/workspace-pane-content";
import { WorkspaceDesktopTabsRow } from "@/screens/workspace/workspace-desktop-tabs-row";
import { deriveWorkspaceTabModel } from "@/screens/workspace/workspace-tab-model";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { SplitNode, SplitPane, WorkspaceLayout } from "@/stores/workspace-layout-store";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/stores/workspace-tabs-store";

interface SplitContainerProps {
  layout: WorkspaceLayout;
  workspaceKey: string;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  uiTabs: WorkspaceTab[];
  hoveredCloseTabKey: string | null;
  setHoveredTabKey: Dispatch<SetStateAction<string | null>>;
  setHoveredCloseTabKey: Dispatch<SetStateAction<string | null>>;
  isArchivingAgent: (input: { serverId: string; agentId: string }) => boolean;
  killTerminalPending: boolean;
  killTerminalId: string | null;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCloseTabsToLeft: (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => Promise<void> | void;
  onSelectNewTabOption: (optionId: "__new_tab_agent__") => void;
  newTabAgentOptionId?: "__new_tab_agent__";
  onOpenPaneTab: (input: { paneId: string; target: WorkspaceTabTarget }) => void;
  onRetargetTab: (tabId: string, target: WorkspaceTabTarget) => void;
  onOpenWorkspaceFile: (input: { paneId: string; filePath: string }) => void;
  onFocusPane: (paneId: string) => void;
  onSplitPane: (input: {
    tabId: string;
    targetPaneId: string;
    position: "left" | "right" | "top" | "bottom";
  }) => void;
  onMoveTabToPane: (tabId: string, toPaneId: string) => void;
  onResizeSplit: (groupId: string, sizes: number[]) => void;
  onReorderTabsInPane: (paneId: string, tabIds: string[]) => void;
  renderPaneEmptyState?: () => ReactNode;
}

interface WorkspaceTabDragData {
  kind: "workspace-tab";
  paneId: string;
  tabId: string;
}

interface SplitPaneDropData {
  kind: "split-pane-drop";
  paneId: string;
}

interface SplitNodeViewProps
  extends Omit<SplitContainerProps, "layout" | "workspaceKey" | "uiTabs"> {
  node: SplitNode;
  tabsById: Map<string, WorkspaceTab>;
  focusedPaneId: string;
  activeDragTabId: string | null;
  showDropZones: boolean;
  dropPreview: SplitDropZoneHover | null;
  onDropPreviewChange: (hover: SplitDropZoneHover | null) => void;
}

interface SplitPaneViewProps
  extends Omit<
    SplitNodeViewProps,
    | "node"
    | "tabsById"
    | "focusedPaneId"
    | "activeDragTabId"
    | "showDropZones"
    | "dropPreview"
    | "onDropPreviewChange"
    | "onSplitPane"
    | "onMoveTabToPane"
    | "onResizeSplit"
  > {
  pane: SplitPane;
  tabsById: Map<string, WorkspaceTab>;
  focused: boolean;
  activeDragTabId: string | null;
  showDropZones: boolean;
  dropPreview: SplitDropZoneHover | null;
  onDropPreviewChange: (hover: SplitDropZoneHover | null) => void;
}

const dropCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const tabHits = pointerHits.filter(
    (entry) => entry.data?.droppableContainer.data.current?.kind === "workspace-tab"
  );
  if (tabHits.length > 0) {
    return tabHits;
  }

  const paneHits = pointerHits.filter(
    (entry) => entry.data?.droppableContainer.data.current?.kind === "split-pane-drop"
  );
  if (paneHits.length > 0) {
    return paneHits;
  }

  return closestCenter(args);
};

export function SplitContainer({
  layout,
  normalizedServerId,
  normalizedWorkspaceId,
  uiTabs,
  hoveredCloseTabKey,
  setHoveredTabKey,
  setHoveredCloseTabKey,
  isArchivingAgent,
  killTerminalPending,
  killTerminalId,
  onNavigateTab,
  onCloseTab,
  onCopyResumeCommand,
  onCopyAgentId,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseOtherTabs,
  onSelectNewTabOption,
  newTabAgentOptionId = "__new_tab_agent__",
  onOpenPaneTab,
  onRetargetTab,
  onOpenWorkspaceFile,
  onFocusPane,
  onSplitPane,
  onMoveTabToPane,
  onResizeSplit,
  onReorderTabsInPane,
  renderPaneEmptyState = () => null,
}: SplitContainerProps) {
  const [activeDragTabId, setActiveDragTabId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<SplitDropZoneHover | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const tabsById = useMemo(() => {
    const next = new Map<string, WorkspaceTab>();
    for (const tab of uiTabs) {
      next.set(tab.tabId, tab);
    }
    return next;
  }, [uiTabs]);

  const panesById = useMemo(() => collectPanesById(layout.root), [layout.root]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as WorkspaceTabDragData | undefined;
    if (data?.kind !== "workspace-tab") {
      setActiveDragTabId(null);
      setDropPreview(null);
      return;
    }
    setActiveDragTabId(data.tabId);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragTabId(null);
    setDropPreview(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeData = event.active.data.current as WorkspaceTabDragData | undefined;
      const overData = event.over?.data.current as
        | WorkspaceTabDragData
        | SplitPaneDropData
        | undefined;

      setActiveDragTabId(null);

      if (activeData?.kind !== "workspace-tab" || !event.over) {
        setDropPreview(null);
        return;
      }

      if (overData?.kind === "workspace-tab") {
        const sourcePane = panesById.get(activeData.paneId) ?? null;
        const targetPane = panesById.get(overData.paneId) ?? null;
        if (!sourcePane || !targetPane) {
          setDropPreview(null);
          return;
        }

        const sourceTabs = getPaneTabDescriptors(sourcePane, tabsById);
        const targetTabs = getPaneTabDescriptors(targetPane, tabsById);
        const sourceIndex = sourceTabs.findIndex((tab) => tab.tabId === activeData.tabId);
        const targetIndex = targetTabs.findIndex((tab) => tab.tabId === overData.tabId);
        if (sourceIndex < 0 || targetIndex < 0) {
          setDropPreview(null);
          return;
        }

        if (activeData.paneId === overData.paneId) {
          if (sourceIndex !== targetIndex) {
            const nextTabs = arrayMove(sourceTabs, sourceIndex, targetIndex);
            onReorderTabsInPane(activeData.paneId, nextTabs.map((tab) => tab.tabId));
          }
          setDropPreview(null);
          return;
        }

        const nextTargetTabIds = targetTabs.map((tab) => tab.tabId);
        nextTargetTabIds.splice(targetIndex, 0, activeData.tabId);
        onMoveTabToPane(activeData.tabId, overData.paneId);
        onReorderTabsInPane(overData.paneId, nextTargetTabIds);
        setDropPreview(null);
        return;
      }

      if (overData?.kind === "split-pane-drop" && dropPreview?.paneId === overData.paneId) {
        if (dropPreview.position === "center") {
          if (activeData.paneId !== overData.paneId) {
            onMoveTabToPane(activeData.tabId, overData.paneId);
          }
          setDropPreview(null);
          return;
        }

        onSplitPane({
          tabId: activeData.tabId,
          targetPaneId: overData.paneId,
          position: dropPreview.position,
        });
      }

      setDropPreview(null);
    },
    [dropPreview, onMoveTabToPane, onReorderTabsInPane, onSplitPane, panesById, tabsById]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dropCollisionDetection}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <SplitNodeView
        node={layout.root}
        tabsById={tabsById}
        focusedPaneId={layout.focusedPaneId}
        normalizedServerId={normalizedServerId}
        normalizedWorkspaceId={normalizedWorkspaceId}
        hoveredCloseTabKey={hoveredCloseTabKey}
        setHoveredTabKey={setHoveredTabKey}
        setHoveredCloseTabKey={setHoveredCloseTabKey}
        isArchivingAgent={isArchivingAgent}
        killTerminalPending={killTerminalPending}
        killTerminalId={killTerminalId}
        onNavigateTab={onNavigateTab}
        onCloseTab={onCloseTab}
        onCopyResumeCommand={onCopyResumeCommand}
        onCopyAgentId={onCopyAgentId}
        onCloseTabsToLeft={onCloseTabsToLeft}
        onCloseTabsToRight={onCloseTabsToRight}
        onCloseOtherTabs={onCloseOtherTabs}
        onSelectNewTabOption={onSelectNewTabOption}
        newTabAgentOptionId={newTabAgentOptionId}
        onOpenPaneTab={onOpenPaneTab}
        onRetargetTab={onRetargetTab}
        onOpenWorkspaceFile={onOpenWorkspaceFile}
        onFocusPane={onFocusPane}
        onSplitPane={onSplitPane}
        onMoveTabToPane={onMoveTabToPane}
        onResizeSplit={onResizeSplit}
        onReorderTabsInPane={onReorderTabsInPane}
        renderPaneEmptyState={renderPaneEmptyState}
        activeDragTabId={activeDragTabId}
        showDropZones={activeDragTabId !== null}
        dropPreview={dropPreview}
        onDropPreviewChange={setDropPreview}
      />
    </DndContext>
  );
}

function SplitNodeView({
  node,
  tabsById,
  focusedPaneId,
  normalizedServerId,
  normalizedWorkspaceId,
  hoveredCloseTabKey,
  setHoveredTabKey,
  setHoveredCloseTabKey,
  isArchivingAgent,
  killTerminalPending,
  killTerminalId,
  onNavigateTab,
  onCloseTab,
  onCopyResumeCommand,
  onCopyAgentId,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseOtherTabs,
  onSelectNewTabOption,
  newTabAgentOptionId,
  onOpenPaneTab,
  onRetargetTab,
  onOpenWorkspaceFile,
  onFocusPane,
  onSplitPane,
  onMoveTabToPane,
  onResizeSplit,
  onReorderTabsInPane,
  renderPaneEmptyState,
  activeDragTabId,
  showDropZones,
  dropPreview,
  onDropPreviewChange,
}: SplitNodeViewProps) {
  if (node.kind === "pane") {
    return (
      <SplitPaneView
        pane={node.pane}
        tabsById={tabsById}
        focused={node.pane.id === focusedPaneId}
        normalizedServerId={normalizedServerId}
        normalizedWorkspaceId={normalizedWorkspaceId}
        hoveredCloseTabKey={hoveredCloseTabKey}
        setHoveredTabKey={setHoveredTabKey}
        setHoveredCloseTabKey={setHoveredCloseTabKey}
        isArchivingAgent={isArchivingAgent}
        killTerminalPending={killTerminalPending}
        killTerminalId={killTerminalId}
        onNavigateTab={onNavigateTab}
        onCloseTab={onCloseTab}
        onCopyResumeCommand={onCopyResumeCommand}
        onCopyAgentId={onCopyAgentId}
        onCloseTabsToLeft={onCloseTabsToLeft}
        onCloseTabsToRight={onCloseTabsToRight}
        onCloseOtherTabs={onCloseOtherTabs}
        onSelectNewTabOption={onSelectNewTabOption}
        newTabAgentOptionId={newTabAgentOptionId}
        onOpenPaneTab={onOpenPaneTab}
        onRetargetTab={onRetargetTab}
        onOpenWorkspaceFile={onOpenWorkspaceFile}
        onFocusPane={onFocusPane}
        onReorderTabsInPane={onReorderTabsInPane}
        renderPaneEmptyState={renderPaneEmptyState}
        activeDragTabId={activeDragTabId}
        showDropZones={showDropZones}
        dropPreview={dropPreview}
        onDropPreviewChange={onDropPreviewChange}
      />
    );
  }

  return (
    <View
      style={[
        styles.group,
        node.group.direction === "horizontal" ? styles.groupHorizontal : styles.groupVertical,
      ]}
    >
      {node.group.children.map((child, index) => (
        <Fragment key={getNodeKey(child)}>
          <View style={[styles.groupChild, { flex: node.group.sizes[index] ?? 1 }]}>
            <SplitNodeView
              node={child}
              tabsById={tabsById}
              focusedPaneId={focusedPaneId}
              normalizedServerId={normalizedServerId}
              normalizedWorkspaceId={normalizedWorkspaceId}
              hoveredCloseTabKey={hoveredCloseTabKey}
              setHoveredTabKey={setHoveredTabKey}
              setHoveredCloseTabKey={setHoveredCloseTabKey}
              isArchivingAgent={isArchivingAgent}
              killTerminalPending={killTerminalPending}
              killTerminalId={killTerminalId}
              onNavigateTab={onNavigateTab}
              onCloseTab={onCloseTab}
              onCopyResumeCommand={onCopyResumeCommand}
              onCopyAgentId={onCopyAgentId}
              onCloseTabsToLeft={onCloseTabsToLeft}
              onCloseTabsToRight={onCloseTabsToRight}
              onCloseOtherTabs={onCloseOtherTabs}
              onSelectNewTabOption={onSelectNewTabOption}
              newTabAgentOptionId={newTabAgentOptionId}
              onOpenPaneTab={onOpenPaneTab}
              onRetargetTab={onRetargetTab}
              onOpenWorkspaceFile={onOpenWorkspaceFile}
              onFocusPane={onFocusPane}
              onSplitPane={onSplitPane}
              onMoveTabToPane={onMoveTabToPane}
              onResizeSplit={onResizeSplit}
              onReorderTabsInPane={onReorderTabsInPane}
              renderPaneEmptyState={renderPaneEmptyState}
              activeDragTabId={activeDragTabId}
              showDropZones={showDropZones}
              dropPreview={dropPreview}
              onDropPreviewChange={onDropPreviewChange}
            />
          </View>
          {index < node.group.children.length - 1 ? (
            <ResizeHandle
              direction={node.group.direction}
              groupId={node.group.id}
              index={index}
              sizes={node.group.sizes}
              onResizeSplit={onResizeSplit}
            />
          ) : null}
        </Fragment>
      ))}
    </View>
  );
}

function SplitPaneView({
  pane,
  tabsById,
  focused,
  normalizedServerId,
  normalizedWorkspaceId,
  hoveredCloseTabKey,
  setHoveredTabKey,
  setHoveredCloseTabKey,
  isArchivingAgent,
  killTerminalPending,
  killTerminalId,
  onNavigateTab,
  onCloseTab,
  onCopyResumeCommand,
  onCopyAgentId,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseOtherTabs,
  onSelectNewTabOption,
  newTabAgentOptionId,
  onOpenPaneTab,
  onRetargetTab,
  onOpenWorkspaceFile,
  onFocusPane,
  onReorderTabsInPane,
  renderPaneEmptyState,
  activeDragTabId,
  showDropZones,
  dropPreview,
  onDropPreviewChange,
}: SplitPaneViewProps) {
  const { theme } = useUnistyles();
  const paneTabs = useMemo(() => getPaneTabDescriptors(pane, tabsById), [pane, tabsById]);
  const paneModel = useMemo(
    () =>
      deriveWorkspaceTabModel({
        tabs: paneTabs.map((tab) => ({
          tabId: tab.tabId,
          target: tab.target,
          createdAt: 0,
        })),
        focusedTabId: pane.focusedTabId,
      }),
    [pane.focusedTabId, paneTabs]
  );
  const activeTabDescriptor = paneModel.activeTab
    ? paneTabs.find((tab) => tab.tabId === paneModel.activeTab?.descriptor.tabId) ?? null
    : null;

  return (
    <View
      style={[
        styles.pane,
        {
          borderColor: focused ? theme.colors.borderAccent : theme.colors.border,
        },
      ]}
      onPointerDownCapture={() => {
        onFocusPane(pane.id);
      }}
    >
      <View
        style={[
          styles.paneTabs,
          focused
            ? {
                borderTopColor: theme.colors.accent,
              }
            : null,
        ]}
      >
        <WorkspaceDesktopTabsRow
          paneId={pane.id}
          tabs={paneTabs}
          activeTabKey={activeTabDescriptor?.key ?? ""}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          hoveredCloseTabKey={hoveredCloseTabKey}
          setHoveredTabKey={setHoveredTabKey}
          setHoveredCloseTabKey={setHoveredCloseTabKey}
          isArchivingAgent={isArchivingAgent}
          killTerminalPending={killTerminalPending}
          killTerminalId={killTerminalId}
          onNavigateTab={onNavigateTab}
          onCloseTab={onCloseTab}
          onCopyResumeCommand={onCopyResumeCommand}
          onCopyAgentId={onCopyAgentId}
          onCloseTabsToLeft={(tabId) => onCloseTabsToLeft(tabId, paneTabs)}
          onCloseTabsToRight={(tabId) => onCloseTabsToRight(tabId, paneTabs)}
          onCloseOtherTabs={(tabId) => onCloseOtherTabs(tabId, paneTabs)}
          onSelectNewTabOption={onSelectNewTabOption}
          newTabAgentOptionId={newTabAgentOptionId ?? "__new_tab_agent__"}
          onReorderTabs={(nextTabs) => {
            onReorderTabsInPane(pane.id, nextTabs.map((tab) => tab.tabId));
          }}
          externalDndContext
          activeDragTabId={activeDragTabId}
        />
      </View>

      <View style={styles.paneContent}>
        {activeTabDescriptor ? (
          <WorkspacePaneContent
            tab={activeTabDescriptor}
            normalizedServerId={normalizedServerId}
            normalizedWorkspaceId={normalizedWorkspaceId}
            onOpenTab={(target) => {
              onOpenPaneTab({
                paneId: pane.id,
                target,
              });
            }}
            onCloseCurrentTab={() => {
              void onCloseTab(activeTabDescriptor.tabId);
            }}
            onRetargetCurrentTab={(target) => {
              onRetargetTab(activeTabDescriptor.tabId, target);
            }}
            onOpenWorkspaceFile={(filePath) => {
              onOpenWorkspaceFile({
                paneId: pane.id,
                filePath,
              });
            }}
          />
        ) : (
          renderPaneEmptyState?.() ?? null
        )}
      </View>

      <SplitDropZone
        paneId={pane.id}
        active={showDropZones}
        preview={dropPreview}
        onHoverChange={onDropPreviewChange}
      />
    </View>
  );
}

function collectPanesById(node: SplitNode): Map<string, SplitPane> {
  const next = new Map<string, SplitPane>();
  function visit(current: SplitNode) {
    if (current.kind === "pane") {
      next.set(current.pane.id, current.pane);
      return;
    }
    for (const child of current.group.children) {
      visit(child);
    }
  }
  visit(node);
  return next;
}

function getPaneTabDescriptors(
  pane: SplitPane,
  tabsById: Map<string, WorkspaceTab>
): WorkspaceTabDescriptor[] {
  const next: WorkspaceTabDescriptor[] = [];
  for (const tabId of pane.tabIds) {
    const tab = tabsById.get(tabId);
    if (!tab) {
      continue;
    }
    next.push({
      key: tab.tabId,
      tabId: tab.tabId,
      kind: tab.target.kind,
      target: tab.target,
    });
  }
  return next;
}

function getNodeKey(node: SplitNode): string {
  if (node.kind === "pane") {
    return node.pane.id;
  }
  return node.group.id;
}

const styles = StyleSheet.create((theme) => ({
  group: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  groupHorizontal: {
    flexDirection: "row",
  },
  groupVertical: {
    flexDirection: "column",
  },
  groupChild: {
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
  },
  pane: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
    borderWidth: 1,
    overflow: "hidden",
  },
  paneTabs: {
    borderTopWidth: 2,
    borderTopColor: "transparent",
  },
  paneContent: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
}));
