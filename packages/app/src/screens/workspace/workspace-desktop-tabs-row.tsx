import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import { Plus, X } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { SortableInlineList } from "@/components/sortable-inline-list";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceTabLayout } from "@/screens/workspace/use-workspace-tab-layout";
import {
  useWorkspaceTabPresentation,
  WorkspaceTabIcon,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import { buildWorkspaceTabMenuEntries } from "@/screens/workspace/workspace-tab-menu";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { encodeFilePathForPathSegment } from "@/utils/host-routes";

const DROPDOWN_WIDTH = 220;
const LOADING_TAB_LABEL_SKELETON_WIDTH = 80;
type NewTabOptionId = "__new_tab_agent__";

type WorkspaceDesktopTabsRowProps = {
  tabs: WorkspaceTabDescriptor[];
  activeTabKey: string;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
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
  onCloseTabsToLeft: (tabId: string) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
  onSelectNewTabOption: (optionId: NewTabOptionId) => void;
  newTabAgentOptionId: NewTabOptionId;
  onReorderTabs: (nextTabs: WorkspaceTabDescriptor[]) => void;
};

function getFallbackTabLabel(tab: WorkspaceTabDescriptor): string {
  if (tab.target.kind === "draft") {
    return "New Agent";
  }
  if (tab.target.kind === "terminal") {
    return "Terminal";
  }
  if (tab.target.kind === "file") {
    return tab.target.path.split("/").filter(Boolean).pop() ?? tab.target.path;
  }
  return "";
}

function getCloseButtonTestId(tab: WorkspaceTabDescriptor): string {
  if (tab.target.kind === "agent") {
    return `workspace-agent-close-${tab.target.agentId}`;
  }
  if (tab.target.kind === "terminal") {
    return `workspace-terminal-close-${tab.target.terminalId}`;
  }
  if (tab.target.kind === "draft") {
    return `workspace-draft-close-${tab.target.draftId}`;
  }
  return `workspace-file-close-${encodeFilePathForPathSegment(tab.target.path)}`;
}

function TabChip({
  tab,
  index,
  tabCount,
  isActive,
  resolvedTabWidth,
  showLabel,
  showCloseButton,
  isCloseHovered,
  isClosingTab,
  normalizedServerId,
  normalizedWorkspaceId,
  setHoveredTabKey,
  setHoveredCloseTabKey,
  onNavigateTab,
  onCloseTab,
  onCopyResumeCommand,
  onCopyAgentId,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseOtherTabs,
  onPresentationChange,
  dragHandleProps,
}: {
  tab: WorkspaceTabDescriptor;
  index: number;
  tabCount: number;
  isActive: boolean;
  resolvedTabWidth: number;
  showLabel: boolean;
  showCloseButton: boolean;
  isCloseHovered: boolean;
  isClosingTab: boolean;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  setHoveredTabKey: Dispatch<SetStateAction<string | null>>;
  setHoveredCloseTabKey: Dispatch<SetStateAction<string | null>>;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCloseTabsToLeft: (tabId: string) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
  onPresentationChange: (tabKey: string, presentation: WorkspaceTabPresentation) => void;
  dragHandleProps: any;
}) {
  const { theme } = useUnistyles();
  const presentation = useWorkspaceTabPresentation({
    tab,
    serverId: normalizedServerId,
    workspaceId: normalizedWorkspaceId,
  });

  useEffect(() => {
    onPresentationChange(tab.key, presentation);
  }, [onPresentationChange, presentation, tab.key]);

  const tooltipLabel =
    presentation.titleState === "loading" ? "Loading agent title" : presentation.label;
  const contextMenuTestId = `workspace-tab-context-${tab.key}`;
  const menuEntries = buildWorkspaceTabMenuEntries({
    surface: "desktop",
    tab,
    index,
    tabCount,
    menuTestIDBase: contextMenuTestId,
    onCopyResumeCommand,
    onCopyAgentId,
    onCloseTab,
    onCloseTabsBefore: onCloseTabsToLeft,
    onCloseTabsAfter: onCloseTabsToRight,
    onCloseOtherTabs,
  });

  return (
    <ContextMenu key={tab.key}>
      <Tooltip delayDuration={400} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild triggerRefProp="triggerRef">
          <ContextMenuTrigger
            testID={`workspace-tab-${tab.key}`}
            enabledOnMobile={false}
            style={({ hovered, pressed }) => [
              styles.tab,
              {
                minWidth: resolvedTabWidth,
                width: resolvedTabWidth,
                maxWidth: resolvedTabWidth,
              },
              isActive && styles.tabActive,
              !isActive && (hovered || pressed || isCloseHovered) && styles.tabHovered,
            ]}
            onHoverIn={() => {
              setHoveredTabKey(tab.key);
            }}
            onHoverOut={() => {
              setHoveredTabKey((current) => (current === tab.key ? null : current));
            }}
            onPressIn={() => {
              onNavigateTab(tab.tabId);
            }}
            onPress={() => {
              onNavigateTab(tab.tabId);
            }}
            accessibilityLabel={tooltipLabel}
          >
            <View
              {...(dragHandleProps?.attributes as any)}
              {...(dragHandleProps?.listeners as any)}
              ref={dragHandleProps?.setActivatorNodeRef}
              style={styles.tabHandle}
            >
              <View style={styles.tabIcon}>
                <WorkspaceTabIcon presentation={presentation} active={isActive} />
              </View>
              {showLabel ? (
                presentation.titleState === "loading" ? (
                  <View
                    style={[
                      styles.tabLabelSkeleton,
                      showCloseButton && styles.tabLabelSkeletonWithCloseButton,
                    ]}
                  />
                ) : (
                  <Text
                    style={[
                      styles.tabLabel,
                      isActive && styles.tabLabelActive,
                      showCloseButton && styles.tabLabelWithCloseButton,
                    ]}
                    selectable={false}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {presentation.label}
                  </Text>
                )
              ) : null}
            </View>

            {showCloseButton ? (
              <Pressable
                testID={getCloseButtonTestId(tab)}
                disabled={isClosingTab}
                onHoverIn={() => {
                  setHoveredTabKey(tab.key);
                  setHoveredCloseTabKey(tab.key);
                }}
                onHoverOut={() => {
                  setHoveredTabKey((current) => (current === tab.key ? null : current));
                  setHoveredCloseTabKey((current) => (current === tab.key ? null : current));
                }}
                onPress={(event) => {
                  event.stopPropagation?.();
                  void onCloseTab(tab.tabId);
                }}
                style={({ hovered, pressed }) => [
                  styles.tabCloseButton,
                  styles.tabCloseButtonShown,
                  (hovered || pressed) && styles.tabCloseButtonActive,
                ]}
              >
                {({ hovered, pressed }) =>
                  isClosingTab ? (
                    <ActivityIndicator
                      size={12}
                      color={hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted}
                    />
                  ) : (
                    <X
                      size={12}
                      color={hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted}
                    />
                  )
                }
              </Pressable>
            ) : null}
          </ContextMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" offset={8}>
          <Text style={styles.newTabTooltipText}>{tooltipLabel}</Text>
        </TooltipContent>
      </Tooltip>

      <ContextMenuContent align="start" width={DROPDOWN_WIDTH} testID={contextMenuTestId}>
        {menuEntries.map((entry) =>
          entry.kind === "separator" ? (
            <ContextMenuSeparator key={entry.key} />
          ) : (
            <ContextMenuItem
              key={entry.key}
              testID={entry.testID}
              disabled={entry.disabled}
              destructive={entry.destructive}
              onSelect={entry.onSelect}
            >
              {entry.label}
            </ContextMenuItem>
          )
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function WorkspaceDesktopTabsRow({
  tabs,
  activeTabKey,
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
  onReorderTabs,
}: WorkspaceDesktopTabsRowProps) {
  const { theme } = useUnistyles();
  const [tabsContainerWidth, setTabsContainerWidth] = useState<number>(0);
  const [tabsActionsWidth, setTabsActionsWidth] = useState<number>(0);
  const [presentationsByKey, setPresentationsByKey] = useState<Map<string, WorkspaceTabPresentation>>(
    () => new Map()
  );

  const handlePresentationChange = useCallback(
    (tabKey: string, presentation: WorkspaceTabPresentation) => {
      setPresentationsByKey((current) => {
        const existing = current.get(tabKey);
        if (
          existing?.label === presentation.label &&
          existing?.subtitle === presentation.subtitle &&
          existing?.titleState === presentation.titleState &&
          existing?.statusBucket === presentation.statusBucket &&
          existing?.icon === presentation.icon
        ) {
          return current;
        }
        const next = new Map(current);
        next.set(tabKey, presentation);
        return next;
      });
    },
    []
  );

  useEffect(() => {
    setPresentationsByKey((current) => {
      const next = new Map<string, WorkspaceTabPresentation>();
      for (const tab of tabs) {
        const presentation = current.get(tab.key);
        if (presentation) {
          next.set(tab.key, presentation);
        }
      }
      return next.size === current.size ? current : next;
    });
  }, [tabs]);

  const handleTabsContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setTabsContainerWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
  }, []);

  const handleTabsActionsLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setTabsActionsWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
  }, []);

  const layoutMetrics = useMemo(
    () => ({
      rowHorizontalInset: 0,
      actionsReservedWidth: Math.max(0, tabsActionsWidth),
      rowPaddingHorizontal: theme.spacing[2],
      tabGap: theme.spacing[1],
      maxTabWidth: 200,
      tabIconWidth: 14,
      tabHorizontalPadding: theme.spacing[3],
      estimatedCharWidth: 7,
      closeButtonWidth: 22,
    }),
    [tabsActionsWidth, theme.spacing]
  );

  const tabLabelLengths = useMemo(
    () =>
      tabs.map((tab) => {
        const presentation = presentationsByKey.get(tab.key);
        if (presentation?.titleState === "loading") {
          return Math.max(1, Math.ceil(LOADING_TAB_LABEL_SKELETON_WIDTH / layoutMetrics.estimatedCharWidth));
        }
        const label = presentation?.label ?? getFallbackTabLabel(tab);
        return label.length;
      }),
    [layoutMetrics.estimatedCharWidth, presentationsByKey, tabs]
  );

  const { layout } = useWorkspaceTabLayout({
    tabLabelLengths,
    viewportWidthOverride: tabsContainerWidth > 0 ? tabsContainerWidth : null,
    metrics: layoutMetrics,
  });

  return (
    <View
      style={styles.tabsContainer}
      testID="workspace-tabs-row"
      onLayout={handleTabsContainerLayout}
    >
      <ScrollView
        horizontal
        scrollEnabled={layout.requiresHorizontalScrollFallback}
        testID="workspace-tabs-scroll"
        style={[
          styles.tabsScroll,
          layout.requiresHorizontalScrollFallback ? styles.tabsScrollOverflow : styles.tabsScrollFitContent,
        ]}
        contentContainerStyle={styles.tabsContent}
        showsHorizontalScrollIndicator={false}
      >
        <SortableInlineList
          data={tabs}
          keyExtractor={(tab) => tab.key}
          useDragHandle
          disabled={tabs.length < 2}
          onDragEnd={onReorderTabs}
          renderItem={({ item: tab, index, dragHandleProps }) => {
            const isActive = tab.key === activeTabKey;
            const isCloseHovered = hoveredCloseTabKey === tab.key;
            const isClosingAgent =
              tab.target.kind === "agent" &&
              isArchivingAgent({
                serverId: normalizedServerId,
                agentId: tab.target.agentId,
              });
            const isClosingTerminal =
              tab.target.kind === "terminal" &&
              killTerminalPending &&
              killTerminalId === tab.target.terminalId;
            const isClosingTab = isClosingAgent || isClosingTerminal;
            const shouldShowCloseButton = layout.closeButtonPolicy === "all";
            const layoutItem = layout.items[index] ?? null;
            const resolvedTabWidth = layoutItem?.width ?? 150;
            const showLabel = layoutItem?.showLabel ?? true;

            return (
              <TabChip
                key={tab.key}
                tab={tab}
                index={index}
                tabCount={tabs.length}
                isActive={isActive}
                resolvedTabWidth={resolvedTabWidth}
                showLabel={showLabel}
                showCloseButton={shouldShowCloseButton}
                isCloseHovered={isCloseHovered}
                isClosingTab={isClosingTab}
                normalizedServerId={normalizedServerId}
                normalizedWorkspaceId={normalizedWorkspaceId}
                setHoveredTabKey={setHoveredTabKey}
                setHoveredCloseTabKey={setHoveredCloseTabKey}
                onNavigateTab={onNavigateTab}
                onCloseTab={onCloseTab}
                onCopyResumeCommand={onCopyResumeCommand}
                onCopyAgentId={onCopyAgentId}
                onCloseTabsToLeft={onCloseTabsToLeft}
                onCloseTabsToRight={onCloseTabsToRight}
                onCloseOtherTabs={onCloseOtherTabs}
                onPresentationChange={handlePresentationChange}
                dragHandleProps={dragHandleProps}
              />
            );
          }}
        />
      </ScrollView>
      <View style={styles.tabsActions} onLayout={handleTabsActionsLayout}>
        <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger
            testID="workspace-new-agent-tab"
            onPress={() => onSelectNewTabOption(newTabAgentOptionId)}
            accessibilityRole="button"
            accessibilityLabel="New agent tab"
            style={({ hovered, pressed }) => [
              styles.newTabActionButton,
              (hovered || pressed) && styles.newTabActionButtonHovered,
            ]}
          >
            <Plus size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" offset={8}>
            <View style={styles.newTabTooltipRow}>
              <Text style={styles.newTabTooltipText}>New agent tab</Text>
              <Shortcut keys={["mod", "T"]} style={styles.newTabTooltipShortcut} />
            </View>
          </TooltipContent>
        </Tooltip>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
  },
  tabsScroll: {
    minWidth: 0,
  },
  tabsScrollFitContent: {
    flexGrow: 0,
    flexShrink: 1,
  },
  tabsScrollOverflow: {
    flex: 1,
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  tabsActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingRight: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  tab: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    userSelect: "none",
  },
  tabHandle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
    userSelect: "none",
  },
  tabIcon: {
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: theme.colors.surface3,
  },
  tabHovered: {
    backgroundColor: theme.colors.surface2,
  },
  tabLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    userSelect: "none",
  },
  tabLabelSkeleton: {
    width: 96,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
    height: 10,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    opacity: 0.9,
  },
  tabLabelSkeletonWithCloseButton: {
    width: LOADING_TAB_LABEL_SKELETON_WIDTH,
  },
  tabLabelWithCloseButton: {
    paddingRight: 0,
  },
  tabLabelActive: {
    color: theme.colors.foreground,
  },
  tabCloseButton: {
    width: 18,
    height: 18,
    marginLeft: 0,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCloseButtonShown: {
    opacity: 1,
  },
  tabCloseButtonActive: {
    backgroundColor: theme.colors.surface3,
  },
  newTabActionButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  newTabActionButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  newTabTooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  newTabTooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  newTabTooltipShortcut: {
    backgroundColor: theme.colors.surface3,
    borderColor: theme.colors.borderAccent,
  },
}));
