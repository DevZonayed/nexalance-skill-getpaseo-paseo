import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import {
  ChevronDown,
  Copy,
  Ellipsis,
  EllipsisVertical,
  PanelRight,
  Plus,
  SquareTerminal,
} from "lucide-react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { StyleSheet, UnistylesRuntime, useUnistyles } from "react-native-unistyles";
import invariant from "tiny-invariant";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { ScreenHeader } from "@/components/headers/screen-header";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Shortcut } from "@/components/ui/shortcut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExplorerSidebar } from "@/components/explorer-sidebar";
import { SplitContainer } from "@/components/split-container";
import { SourceControlPanelIcon } from "@/components/icons/source-control-panel-icon";
import { WorkspaceGitActions } from "@/screens/workspace/workspace-git-actions";
import { ExplorerSidebarAnimationProvider } from "@/contexts/explorer-sidebar-animation-context";
import { useToast } from "@/contexts/toast-context";
import { useExplorerOpenGesture } from "@/hooks/use-explorer-open-gesture";
import { usePanelStore, type ExplorerCheckoutContext } from "@/stores/panel-store";
import {
  useSessionStore,
} from "@/stores/session-store";
import {
  buildWorkspaceTabPersistenceKey,
  collectAllTabs,
  findPaneById,
  useWorkspaceLayoutStore,
  type SplitPane,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import {
  buildWorkspaceOpenIntentParam,
  type WorkspaceOpenIntent,
  decodeWorkspaceIdFromPathSegment,
} from "@/utils/host-routes";
import { normalizeWorkspaceIdentity } from "@/utils/workspace-identity";
import { useHostRuntimeSession } from "@/runtime/host-runtime";
import { useWorkspaceTerminalSessionRetention } from "@/terminal/hooks/use-workspace-terminal-session-retention";
import {
  checkoutStatusQueryKey,
  type CheckoutStatusPayload,
} from "@/hooks/use-checkout-status-query";
import type { ListTerminalsResponse } from "@server/shared/messages";
import { upsertTerminalListEntry } from "@/utils/terminal-list";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { buildProviderCommand } from "@/utils/provider-command-templates";
import { generateDraftId } from "@/stores/draft-keys";
import {
  useWorkspaceTabPresentation,
  WorkspaceTabIcon,
  WorkspaceTabOptionRow,
} from "@/screens/workspace/workspace-tab-presentation";
import { buildWorkspaceTabMenuEntries } from "@/screens/workspace/workspace-tab-menu";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import {
  resolveWorkspaceHeader,
  shouldRenderMissingWorkspaceDescriptor,
} from "@/screens/workspace/workspace-header-source";
import {
  deriveWorkspaceAgentVisibility,
} from "@/screens/workspace/workspace-agent-visibility";
import {
  deriveWorkspaceTabModel,
} from "@/screens/workspace/workspace-tab-model";
import { WorkspacePaneContent } from "@/screens/workspace/workspace-pane-content";
import {
  buildBulkCloseConfirmationMessage,
  classifyBulkClosableTabs,
} from "@/screens/workspace/workspace-bulk-close";
import { findAdjacentPane } from "@/utils/split-navigation";

const TERMINALS_QUERY_STALE_TIME = 5_000;
const NEW_TAB_AGENT_OPTION_ID = "__new_tab_agent__";
const EMPTY_UI_TABS: WorkspaceTab[] = [];

interface FocusedPaneTabState {
  tabs: WorkspaceTab[];
  focusedTabId: string | null;
}

type WorkspaceScreenProps = {
  serverId: string;
  workspaceId: string;
  openIntent?: WorkspaceOpenIntent | null;
};

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildOpenIntentKey(input: {
  serverId: string;
  workspaceId: string;
  openIntent?: WorkspaceOpenIntent | null;
}): string | null {
  if (!input.openIntent) {
    return null;
  }
  const openParam = buildWorkspaceOpenIntentParam(input.openIntent);
  if (!openParam) {
    return null;
  }
  return `${input.serverId}:${input.workspaceId}:${openParam}`;
}

function getFallbackTabOptionLabel(tab: WorkspaceTabDescriptor): string {
  if (tab.target.kind === "draft") {
    return "New Agent";
  }
  if (tab.target.kind === "terminal") {
    return "Terminal";
  }
  if (tab.target.kind === "file") {
    return tab.target.path.split("/").filter(Boolean).pop() ?? tab.target.path;
  }
  return "Agent";
}

function getFallbackTabOptionDescription(tab: WorkspaceTabDescriptor): string {
  if (tab.target.kind === "draft") {
    return "New Agent";
  }
  if (tab.target.kind === "agent") {
    return "Agent";
  }
  if (tab.target.kind === "terminal") {
    return "Terminal";
  }
  return tab.target.path;
}

function workspaceTabTargetsEqual(left: WorkspaceTabTarget, right: WorkspaceTabTarget): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "draft" && right.kind === "draft") {
    return left.draftId === right.draftId;
  }
  if (left.kind === "agent" && right.kind === "agent") {
    return left.agentId === right.agentId;
  }
  if (left.kind === "terminal" && right.kind === "terminal") {
    return left.terminalId === right.terminalId;
  }
  if (left.kind === "file" && right.kind === "file") {
    return left.path === right.path;
  }
  return false;
}

function getFocusedPaneTabState(input: {
  layout: WorkspaceLayout | null;
  tabs: WorkspaceTab[];
}): FocusedPaneTabState {
  const { layout, tabs } = input;
  if (!layout) {
    return {
      tabs,
      focusedTabId: null,
    };
  }

  const focusedPane = findPaneById(layout.root, layout.focusedPaneId);
  if (!focusedPane) {
    return {
      tabs,
      focusedTabId: null,
    };
  }

  const tabsById = new Map<string, WorkspaceTab>();
  for (const tab of tabs) {
    tabsById.set(tab.tabId, tab);
  }

  const orderedTabs: WorkspaceTab[] = [];
  for (const tabId of focusedPane.tabIds) {
    const tab = tabsById.get(tabId);
    if (tab) {
      orderedTabs.push(tab);
    }
  }

  return {
    tabs: orderedTabs,
    focusedTabId: focusedPane.focusedTabId,
  };
}

function getEffectiveFocusedTabId(input: FocusedPaneTabState): string | null {
  return trimNonEmpty(input.focusedTabId) ?? input.tabs[0]?.tabId ?? null;
}

function getFocusedPane(layout: WorkspaceLayout | null): SplitPane | null {
  if (!layout) {
    return null;
  }
  return findPaneById(layout.root, layout.focusedPaneId);
}

function getFocusedPaneActiveTabId(pane: SplitPane | null): string | null {
  if (!pane) {
    return null;
  }
  return trimNonEmpty(pane.focusedTabId) ?? pane.tabIds[0] ?? null;
}

type MobileWorkspaceTabSwitcherProps = {
  tabs: WorkspaceTabDescriptor[];
  activeTabKey: string;
  activeTab: WorkspaceTabDescriptor | null;
  tabSwitcherOptions: ComboboxOption[];
  tabByKey: Map<string, WorkspaceTabDescriptor>;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onSelectSwitcherTab: (key: string) => void;
  onSelectNewTabOption: (key: typeof NEW_TAB_AGENT_OPTION_ID) => void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCloseTabsAbove: (tabId: string) => Promise<void> | void;
  onCloseTabsBelow: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
};

function MobileActiveTabTrigger({
  activeTab,
  normalizedServerId,
  normalizedWorkspaceId,
}: {
  activeTab: WorkspaceTabDescriptor | null;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
}) {
  if (!activeTab) {
    return null;
  }

  return (
    <ResolvedMobileActiveTabTrigger
      activeTab={activeTab}
      normalizedServerId={normalizedServerId}
      normalizedWorkspaceId={normalizedWorkspaceId}
    />
  );
}

function ResolvedMobileActiveTabTrigger({
  activeTab,
  normalizedServerId,
  normalizedWorkspaceId,
}: {
  activeTab: WorkspaceTabDescriptor;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
}) {
  const presentation = useWorkspaceTabPresentation({
    tab: activeTab,
    serverId: normalizedServerId,
    workspaceId: normalizedWorkspaceId,
  });

  return (
    <>
      <View style={styles.switcherTriggerIcon} testID="workspace-active-tab-icon">
        <WorkspaceTabIcon presentation={presentation} active />
      </View>

      <Text style={styles.switcherTriggerText} numberOfLines={1}>
        {presentation.titleState === "loading" ? "Loading..." : presentation.label}
      </Text>
    </>
  );
}

function MobileWorkspaceTabOption({
  tab,
  tabIndex,
  tabCount,
  normalizedServerId,
  normalizedWorkspaceId,
  selected,
  active,
  onPress,
  onCopyResumeCommand,
  onCopyAgentId,
  onCloseTab,
  onCloseTabsAbove,
  onCloseTabsBelow,
  onCloseOtherTabs,
}: {
  tab: WorkspaceTabDescriptor;
  tabIndex: number;
  tabCount: number;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  selected: boolean;
  active: boolean;
  onPress: () => void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCloseTabsAbove: (tabId: string) => Promise<void> | void;
  onCloseTabsBelow: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
}) {
  const { theme } = useUnistyles();
  const presentation = useWorkspaceTabPresentation({
    tab,
    serverId: normalizedServerId,
    workspaceId: normalizedWorkspaceId,
  });
  const menuTestIDBase = `workspace-tab-menu-${tab.key}`;
  const menuEntries = buildWorkspaceTabMenuEntries({
    surface: "mobile",
    tab,
    index: tabIndex,
    tabCount,
    menuTestIDBase,
    onCopyResumeCommand,
    onCopyAgentId,
    onCloseTab,
    onCloseTabsBefore: onCloseTabsAbove,
    onCloseTabsAfter: onCloseTabsBelow,
    onCloseOtherTabs,
  });

  return (
    <WorkspaceTabOptionRow
      presentation={presentation}
      selected={selected}
      active={active}
      onPress={onPress}
      trailingAccessory={
        <DropdownMenu>
          <DropdownMenuTrigger
            testID={`${menuTestIDBase}-trigger`}
            accessibilityRole="button"
            accessibilityLabel={`Open menu for ${presentation.label}`}
            hitSlop={8}
            style={({ open, pressed }) => [
              styles.mobileTabMenuTrigger,
              (open || pressed) && styles.mobileTabMenuTriggerActive,
            ]}
          >
            <Ellipsis
              size={theme.iconSize.sm}
              color={theme.colors.foregroundMuted}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="end"
            width={220}
            testID={menuTestIDBase}
          >
            {menuEntries.map((entry) =>
              entry.kind === "separator" ? (
                <DropdownMenuSeparator key={entry.key} />
              ) : (
                <DropdownMenuItem
                  key={entry.key}
                  testID={entry.testID}
                  disabled={entry.disabled}
                  destructive={entry.destructive}
                  onSelect={entry.onSelect}
                >
                  {entry.label}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
}

const MobileWorkspaceTabSwitcher = memo(function MobileWorkspaceTabSwitcher({
  tabs,
  activeTabKey,
  activeTab,
  tabSwitcherOptions,
  tabByKey,
  normalizedServerId,
  normalizedWorkspaceId,
  onSelectSwitcherTab,
  onSelectNewTabOption,
  onCopyResumeCommand,
  onCopyAgentId,
  onCloseTab,
  onCloseTabsAbove,
  onCloseTabsBelow,
  onCloseOtherTabs,
}: MobileWorkspaceTabSwitcherProps) {
  const { theme } = useUnistyles();
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<View>(null);
  const tabIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    tabs.forEach((tab, index) => {
      map.set(tab.key, index);
    });
    return map;
  }, [tabs]);

  return (
    <View style={styles.mobileTabsRow} testID="workspace-tabs-row">
      <Pressable
        ref={anchorRef}
        testID="workspace-tab-switcher-trigger"
        style={({ hovered, pressed }) => [
          styles.switcherTrigger,
          (hovered || pressed || isOpen) && styles.switcherTriggerActive,
          { borderWidth: 0, borderColor: "transparent" },
          Platform.OS === "web"
            ? {
                outlineStyle: "solid",
                outlineWidth: 0,
                outlineColor: "transparent",
              }
            : null,
        ]}
        onPress={() => setIsOpen(true)}
      >
        <View style={styles.switcherTriggerLeft}>
          <MobileActiveTabTrigger
            activeTab={activeTab}
            normalizedServerId={normalizedServerId}
            normalizedWorkspaceId={normalizedWorkspaceId}
          />
        </View>

        <ChevronDown size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </Pressable>

      <View style={styles.mobileTabsActions}>
        <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger
            testID="workspace-new-agent-tab"
            onPress={() => onSelectNewTabOption(NEW_TAB_AGENT_OPTION_ID)}
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

      <Combobox
        options={tabSwitcherOptions}
        value={activeTabKey}
        onSelect={onSelectSwitcherTab}
        searchable={false}
        title="Switch tab"
        searchPlaceholder="Search tabs"
        open={isOpen}
        onOpenChange={setIsOpen}
        enableDismissOnClose={false}
        anchorRef={anchorRef}
        renderOption={({ option, selected, active, onPress }) => {
          const tab = tabByKey.get(option.id);
          if (!tab) {
            return <View />;
          }
          const tabIndex = tabIndexByKey.get(tab.key) ?? -1;
          if (tabIndex < 0) {
            return <View />;
          }
          return (
            <MobileWorkspaceTabOption
              tab={tab}
              tabIndex={tabIndex}
              tabCount={tabs.length}
              normalizedServerId={normalizedServerId}
              normalizedWorkspaceId={normalizedWorkspaceId}
              selected={selected}
              active={active}
              onPress={onPress}
              onCopyResumeCommand={onCopyResumeCommand}
              onCopyAgentId={onCopyAgentId}
              onCloseTab={onCloseTab}
              onCloseTabsAbove={onCloseTabsAbove}
              onCloseTabsBelow={onCloseTabsBelow}
              onCloseOtherTabs={onCloseOtherTabs}
            />
          );
        }}
      />
    </View>
  );
});

export function WorkspaceScreen({
  serverId,
  workspaceId,
  openIntent,
}: WorkspaceScreenProps) {
  return (
    <ExplorerSidebarAnimationProvider>
      <WorkspaceScreenContent
        serverId={serverId}
        workspaceId={workspaceId}
        openIntent={openIntent}
      />
    </ExplorerSidebarAnimationProvider>
  );
}

function WorkspaceScreenContent({
  serverId,
  workspaceId,
  openIntent,
}: WorkspaceScreenProps) {
  const { theme } = useUnistyles();
  const isDarkMode = useColorScheme() === "dark";
  const mainBackgroundColor = isDarkMode ? theme.colors.surface1 : theme.colors.surface0;
  const toast = useToast();
  const isScreenFocused = useIsFocused();
  const isMobile =
    UnistylesRuntime.breakpoint === "xs" || UnistylesRuntime.breakpoint === "sm";

  const normalizedServerId = trimNonEmpty(decodeSegment(serverId)) ?? "";
  const normalizedWorkspaceId =
    normalizeWorkspaceIdentity(decodeWorkspaceIdFromPathSegment(workspaceId)) ?? "";
  const workspaceTerminalScopeKey =
    normalizedServerId && normalizedWorkspaceId
      ? `${normalizedServerId}:${normalizedWorkspaceId}`
      : null;
  useWorkspaceTerminalSessionRetention({
    scopeKey: workspaceTerminalScopeKey,
  });

  const queryClient = useQueryClient();
  const { client, isConnected } = useHostRuntimeSession(normalizedServerId);

  const sessionAgents = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.agents
  );
  const workspaceAgentVisibility = useMemo(
    () =>
      deriveWorkspaceAgentVisibility({
        sessionAgents,
        workspaceId: normalizedWorkspaceId,
      }),
    [normalizedWorkspaceId, sessionAgents]
  );
  const workspaceAgents = workspaceAgentVisibility.visibleAgents;

  const terminalsQueryKey = useMemo(
    () => ["terminals", normalizedServerId, normalizedWorkspaceId] as const,
    [normalizedServerId, normalizedWorkspaceId]
  );
  type ListTerminalsPayload = ListTerminalsResponse["payload"];
  const terminalsQuery = useQuery({
    queryKey: terminalsQueryKey,
    enabled:
      Boolean(client && isConnected) &&
      normalizedWorkspaceId.length > 0 &&
      normalizedWorkspaceId.startsWith("/"),
    queryFn: async () => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      return await client.listTerminals(normalizedWorkspaceId);
    },
    staleTime: TERMINALS_QUERY_STALE_TIME,
  });
  const terminals = terminalsQuery.data?.terminals ?? [];
  const createTerminalMutation = useMutation({
    mutationFn: async () => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      return await client.createTerminal(normalizedWorkspaceId);
    },
    onSuccess: (payload) => {
      const createdTerminal = payload.terminal;
      if (createdTerminal) {
        queryClient.setQueryData<ListTerminalsPayload>(
          terminalsQueryKey,
          (current) => {
            const nextTerminals = upsertTerminalListEntry({
              terminals: current?.terminals ?? [],
              terminal: createdTerminal,
            });
            return {
              cwd: current?.cwd ?? normalizedWorkspaceId,
              terminals: nextTerminals,
              requestId: current?.requestId ?? `terminal-create-${createdTerminal.id}`,
            };
          }
        );
      }

      void queryClient.invalidateQueries({ queryKey: terminalsQueryKey });
      if (createdTerminal) {
        const workspaceKey = buildWorkspaceTabPersistenceKey({
          serverId: normalizedServerId,
          workspaceId: normalizedWorkspaceId,
        });
        if (!workspaceKey) {
          return;
        }
        const tabId = useWorkspaceLayoutStore
          .getState()
          .openTab(workspaceKey, { kind: "terminal", terminalId: createdTerminal.id });
        if (tabId) {
          useWorkspaceLayoutStore.getState().focusTab(workspaceKey, tabId);
        }
      }
    },
  });
  const killTerminalMutation = useMutation({
    mutationFn: async (terminalId: string) => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      const payload = await client.killTerminal(terminalId);
      if (!payload.success) {
        throw new Error("Unable to close terminal");
      }
      return payload;
    },
  });
  const { archiveAgent, isArchivingAgent } = useArchiveAgent();

  useEffect(() => {
    if (!client || !isConnected || !normalizedWorkspaceId.startsWith("/")) {
      return;
    }

    const unsubscribeChanged = client.on("terminals_changed", (message) => {
      if (message.type !== "terminals_changed") {
        return;
      }
      if (message.payload.cwd !== normalizedWorkspaceId) {
        return;
      }

      queryClient.setQueryData<ListTerminalsPayload>(terminalsQueryKey, (current) => ({
        cwd: message.payload.cwd,
        terminals: message.payload.terminals,
        requestId: current?.requestId ?? `terminals-changed-${Date.now()}`,
      }));
    });

    const unsubscribeStreamExit = client.on("terminal_stream_exit", (message) => {
      if (message.type !== "terminal_stream_exit") {
        return;
      }
    });

    client.subscribeTerminals({ cwd: normalizedWorkspaceId });

    return () => {
      unsubscribeChanged();
      unsubscribeStreamExit();
      client.unsubscribeTerminals({ cwd: normalizedWorkspaceId });
    };
  }, [client, isConnected, normalizedWorkspaceId, queryClient, terminalsQueryKey]);

  const checkoutQuery = useQuery({
    queryKey: checkoutStatusQueryKey(normalizedServerId, normalizedWorkspaceId),
    enabled:
      Boolean(client && isConnected) &&
      normalizedWorkspaceId.length > 0 &&
      normalizedWorkspaceId.startsWith("/"),
    queryFn: async () => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      return (await client.getCheckoutStatus(
        normalizedWorkspaceId
      )) as CheckoutStatusPayload;
    },
    staleTime: 15_000,
  });

  const workspaceDescriptor = useSessionStore(
    (state) =>
      state.sessions[normalizedServerId]?.workspaces.get(normalizedWorkspaceId) ??
      null
  );
  const hasHydratedWorkspaces = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.hasHydratedWorkspaces ?? false
  );
  const hasHydratedAgents = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.hasHydratedAgents ?? false
  );
  const workspaceHeader = workspaceDescriptor
    ? resolveWorkspaceHeader({ workspace: workspaceDescriptor })
    : null;
  const isWorkspaceHeaderLoading = workspaceHeader === null;

  const isGitCheckout = checkoutQuery.data?.isGit ?? false;
  const currentBranchName =
    checkoutQuery.data?.isGit && checkoutQuery.data.currentBranch !== "HEAD"
      ? trimNonEmpty(checkoutQuery.data.currentBranch)
      : null;
  const mobileView = usePanelStore((state) => state.mobileView);
  const desktopFileExplorerOpen = usePanelStore(
    (state) => state.desktop.fileExplorerOpen
  );
  const toggleFileExplorer = usePanelStore((state) => state.toggleFileExplorer);
  const openFileExplorer = usePanelStore((state) => state.openFileExplorer);
  const activateExplorerTabForCheckout = usePanelStore(
    (state) => state.activateExplorerTabForCheckout
  );
  const closeToAgent = usePanelStore((state) => state.closeToAgent);
  const setActiveExplorerCheckout = usePanelStore(
    (state) => state.setActiveExplorerCheckout
  );

  const isExplorerOpen = isMobile
    ? mobileView === "file-explorer"
    : desktopFileExplorerOpen;

  const activeExplorerCheckout = useMemo<ExplorerCheckoutContext | null>(() => {
    if (!normalizedServerId || !normalizedWorkspaceId.startsWith("/")) {
      return null;
    }
    return {
      serverId: normalizedServerId,
      cwd: normalizedWorkspaceId,
      isGit: isGitCheckout,
    };
  }, [isGitCheckout, normalizedServerId, normalizedWorkspaceId]);

  useEffect(() => {
    setActiveExplorerCheckout(activeExplorerCheckout);
  }, [activeExplorerCheckout, setActiveExplorerCheckout]);

  const openExplorerForWorkspace = useCallback(() => {
    if (!activeExplorerCheckout) {
      return;
    }
    activateExplorerTabForCheckout(activeExplorerCheckout);
    openFileExplorer();
  }, [
    activateExplorerTabForCheckout,
    activeExplorerCheckout,
    openFileExplorer,
  ]);

  const handleToggleExplorer = useCallback(() => {
    if (isExplorerOpen) {
      toggleFileExplorer();
      return;
    }
    openExplorerForWorkspace();
  }, [isExplorerOpen, openExplorerForWorkspace, toggleFileExplorer]);

  const explorerOpenGesture = useExplorerOpenGesture({
    enabled: isMobile && mobileView === "agent",
    onOpen: openExplorerForWorkspace,
  });

  useEffect(() => {
    if (Platform.OS === "web" || !isExplorerOpen) {
      return;
    }

    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isExplorerOpen) {
        closeToAgent();
        return true;
      }
      return false;
    });

    return () => handler.remove();
  }, [closeToAgent, isExplorerOpen]);

  const agentsById = workspaceAgentVisibility.lookupById;

  const persistenceKey = useMemo(
    () =>
      buildWorkspaceTabPersistenceKey({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
      }),
    [normalizedServerId, normalizedWorkspaceId]
  );

  const workspaceLayout = useWorkspaceLayoutStore((state) =>
    persistenceKey ? state.layoutByWorkspace[persistenceKey] ?? null : null
  );
  const uiTabs = useMemo(
    () => (workspaceLayout ? collectAllTabs(workspaceLayout.root) : EMPTY_UI_TABS),
    [workspaceLayout]
  );
  const openWorkspaceTab = useWorkspaceLayoutStore((state) => state.openTab);
  const focusWorkspaceTab = useWorkspaceLayoutStore((state) => state.focusTab);
  const closeWorkspaceTab = useWorkspaceLayoutStore((state) => state.closeTab);
  const retargetWorkspaceTab = useWorkspaceLayoutStore((state) => state.retargetTab);
  const splitWorkspacePane = useWorkspaceLayoutStore((state) => state.splitPane);
  const moveWorkspaceTabToPane = useWorkspaceLayoutStore((state) => state.moveTabToPane);
  const focusWorkspacePane = useWorkspaceLayoutStore((state) => state.focusPane);
  const resizeWorkspaceSplit = useWorkspaceLayoutStore((state) => state.resizeSplit);
  const reorderWorkspaceTabsInPane = useWorkspaceLayoutStore((state) => state.reorderTabsInPane);
  const pendingByDraftId = useCreateFlowStore((state) => state.pendingByDraftId);
  const consumedOpenIntentsRef = useRef(new Set<string>());
  const pendingCloseTabIdsRef = useRef(new Set<string>());
  const [resolvedOpenIntentKey, setResolvedOpenIntentKey] = useState<string | null>(null);
  const currentOpenIntentKey = useMemo(
    () =>
      buildOpenIntentKey({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
        openIntent,
      }),
    [normalizedServerId, normalizedWorkspaceId, openIntent]
  );

  const focusedPaneTabState = useMemo(
    () =>
      getFocusedPaneTabState({
        layout: workspaceLayout,
        tabs: uiTabs,
      }),
    [uiTabs, workspaceLayout]
  );

  const ensureWorkspaceTab = useCallback(
    function ensureWorkspaceTab(target: WorkspaceTabTarget): string | null {
      if (!persistenceKey) {
        return null;
      }

      const existingTab =
        uiTabs.find((tab) => workspaceTabTargetsEqual(tab.target, target)) ?? null;
      if (existingTab) {
        return existingTab.tabId;
      }

      const previousFocusedTabId = getEffectiveFocusedTabId(focusedPaneTabState);
      const tabId = openWorkspaceTab(persistenceKey, target);
      if (tabId && previousFocusedTabId && previousFocusedTabId !== tabId) {
        focusWorkspaceTab(persistenceKey, previousFocusedTabId);
      }
      return tabId;
    },
    [focusWorkspaceTab, focusedPaneTabState, openWorkspaceTab, persistenceKey, uiTabs]
  );

  const openWorkspaceDraftTab = useCallback(
    function openWorkspaceDraftTab(input?: { draftId?: string; focus?: boolean }) {
      if (!persistenceKey) {
        return null;
      }

      const target: WorkspaceTabTarget = {
        kind: "draft",
        draftId: trimNonEmpty(input?.draftId) ?? generateDraftId(),
      };
      if (input?.focus === false) {
        return ensureWorkspaceTab(target);
      }

      const tabId = openWorkspaceTab(persistenceKey, target);
      if (tabId) {
        focusWorkspaceTab(persistenceKey, tabId);
      }
      return tabId;
    },
    [ensureWorkspaceTab, focusWorkspaceTab, openWorkspaceTab, persistenceKey]
  );

  useEffect(() => {
    if (!currentOpenIntentKey) {
      if (resolvedOpenIntentKey !== null) {
        setResolvedOpenIntentKey(null);
      }
      return;
    }

    if (resolvedOpenIntentKey === currentOpenIntentKey) {
      return;
    }
  }, [currentOpenIntentKey, resolvedOpenIntentKey]);

  useEffect(() => {
    if (!openIntent || !persistenceKey) {
      return;
    }

    if (!currentOpenIntentKey) {
      return;
    }
    const intentKey = currentOpenIntentKey;
    if (consumedOpenIntentsRef.current.has(intentKey)) {
      if (resolvedOpenIntentKey !== intentKey) {
        setResolvedOpenIntentKey(intentKey);
      }
      return;
    }
    consumedOpenIntentsRef.current.add(intentKey);

    if (openIntent.kind === "draft") {
      const draftId = openIntent.draftId.trim();
      const tabId = openWorkspaceDraftTab({
        ...(draftId === "new" ? {} : { draftId }),
        focus: true,
      });
      if (tabId) {
        setResolvedOpenIntentKey(intentKey);
      }
      return;
    }

    const target: WorkspaceTabTarget =
      openIntent.kind === "agent"
        ? { kind: "agent", agentId: openIntent.agentId }
        : openIntent.kind === "terminal"
          ? { kind: "terminal", terminalId: openIntent.terminalId }
          : { kind: "file", path: openIntent.path };
    const tabId = openWorkspaceTab(persistenceKey, target);
    if (tabId) {
      setResolvedOpenIntentKey(intentKey);
    }
  }, [
    currentOpenIntentKey,
    openIntent,
    openWorkspaceDraftTab,
    openWorkspaceTab,
    persistenceKey,
    resolvedOpenIntentKey,
  ]);

  const unresolvedOpenIntent = currentOpenIntentKey && resolvedOpenIntentKey !== currentOpenIntentKey
    ? openIntent
    : null;

  useEffect(() => {
    if (!normalizedServerId || !normalizedWorkspaceId || !persistenceKey) {
      return;
    }

    const agentIds = new Set(workspaceAgents.map((agent) => agent.id));
    const terminalIds = new Set(terminals.map((terminal) => terminal.id));
    const hasActivePendingDraftCreateInWorkspace = uiTabs.some((tab) => {
      if (tab.target.kind !== "draft") {
        return false;
      }
      const pending = pendingByDraftId[tab.target.draftId];
      return pending?.serverId === normalizedServerId && pending.lifecycle === "active";
    });

    for (const agent of workspaceAgents) {
      const representedByTarget = uiTabs.some(
        (tab) => tab.target.kind === "agent" && tab.target.agentId === agent.id
      );
      const representedByDeterministicTabId = uiTabs.some(
        (tab) => tab.tabId === `agent_${agent.id}`
      );
      if (
        hasActivePendingDraftCreateInWorkspace &&
        !representedByTarget &&
        !representedByDeterministicTabId
      ) {
        continue;
      }
      ensureWorkspaceTab({ kind: "agent", agentId: agent.id });
    }
    for (const terminal of terminals) {
      ensureWorkspaceTab({ kind: "terminal", terminalId: terminal.id });
    }

    const canPruneAgentTabs = hasHydratedAgents;
    const canPruneTerminalTabs = terminalsQuery.isSuccess;
    for (const tab of uiTabs) {
      if (canPruneAgentTabs && tab.target.kind === "agent" && !agentIds.has(tab.target.agentId)) {
        closeWorkspaceTab(persistenceKey, tab.tabId);
      }
      if (
        canPruneTerminalTabs &&
        tab.target.kind === "terminal" &&
        !terminalIds.has(tab.target.terminalId)
      ) {
        closeWorkspaceTab(persistenceKey, tab.tabId);
      }
    }
  }, [
    closeWorkspaceTab,
    ensureWorkspaceTab,
    hasHydratedAgents,
    pendingByDraftId,
    persistenceKey,
    terminals,
    terminalsQuery.isSuccess,
    uiTabs,
    workspaceAgents,
  ]);

  const tabModel = useMemo(
    () =>
      deriveWorkspaceTabModel({
        tabs: focusedPaneTabState.tabs,
        focusedTabId: focusedPaneTabState.focusedTabId,
        preferredTarget:
          unresolvedOpenIntent?.kind === "agent"
            ? { kind: "agent", agentId: unresolvedOpenIntent.agentId }
            : unresolvedOpenIntent?.kind === "terminal"
              ? { kind: "terminal", terminalId: unresolvedOpenIntent.terminalId }
              : unresolvedOpenIntent?.kind === "draft"
                ? { kind: "draft", draftId: unresolvedOpenIntent.draftId }
                : unresolvedOpenIntent?.kind === "file"
                  ? { kind: "file", path: unresolvedOpenIntent.path }
                  : null,
      }),
    [focusedPaneTabState, unresolvedOpenIntent]
  );
  const activeTabId = tabModel.activeTabId;

  useEffect(() => {
    if (!activeTabId || !persistenceKey) {
      return;
    }
    focusWorkspaceTab(persistenceKey, activeTabId);
  }, [activeTabId, focusWorkspaceTab, persistenceKey]);

  const activeTab = tabModel.activeTab;

  const tabs = useMemo<WorkspaceTabDescriptor[]>(
    () => tabModel.tabs.map((tab) => tab.descriptor),
    [tabModel.tabs]
  );

  const navigateToTabId = useCallback(
    function navigateToTabId(tabId: string) {
      if (!tabId || !persistenceKey) {
        return;
      }
      focusWorkspaceTab(persistenceKey, tabId);
    },
    [focusWorkspaceTab, persistenceKey]
  );

  const emptyWorkspaceSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!persistenceKey) {
      return;
    }
    if (openIntent) {
      emptyWorkspaceSeedRef.current = null;
      return;
    }
    if (workspaceAgents.length > 0 || terminals.length > 0) {
      emptyWorkspaceSeedRef.current = null;
      return;
    }
    if (tabs.length > 0) {
      emptyWorkspaceSeedRef.current = null;
      return;
    }
    const workspaceKey = `${normalizedServerId}:${normalizedWorkspaceId}`;
    if (emptyWorkspaceSeedRef.current === workspaceKey) {
      return;
    }
    emptyWorkspaceSeedRef.current = workspaceKey;
    openWorkspaceDraftTab();
  }, [
    normalizedServerId,
    normalizedWorkspaceId,
    openIntent,
    openWorkspaceDraftTab,
    persistenceKey,
    terminals.length,
    tabs.length,
    workspaceAgents.length,
  ]);

  const handleOpenFileFromExplorer = useCallback(
    function handleOpenFileFromExplorer(filePath: string) {
      if (isMobile) {
        closeToAgent();
      }
      if (!persistenceKey) {
        return;
      }
      const tabId = openWorkspaceTab(persistenceKey, { kind: "file", path: filePath });
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [closeToAgent, isMobile, navigateToTabId, openWorkspaceTab, persistenceKey]
  );

  const handleOpenFileFromChat = useCallback(
    ({ filePath }: { filePath: string }) => {
      const normalizedFilePath = filePath.trim();
      if (!normalizedFilePath) {
        return;
      }
      handleOpenFileFromExplorer(normalizedFilePath);
    },
    [handleOpenFileFromExplorer]
  );

  const [hoveredTabKey, setHoveredTabKey] = useState<string | null>(null);
  const [hoveredCloseTabKey, setHoveredCloseTabKey] = useState<string | null>(
    null
  );

  const tabByKey = useMemo(() => {
    const map = new Map<string, WorkspaceTabDescriptor>();
    for (const tab of tabs) {
      map.set(tab.key, tab);
    }
    return map;
  }, [tabs]);

  const allTabDescriptorsById = useMemo(() => {
    const map = new Map<string, WorkspaceTabDescriptor>();
    for (const tab of uiTabs) {
      map.set(tab.tabId, {
        key: tab.tabId,
        tabId: tab.tabId,
        kind: tab.target.kind,
        target: tab.target,
      });
    }
    return map;
  }, [uiTabs]);

  const activeTabKey = activeTabId ?? "";

  const tabSwitcherOptions = useMemo(
    () =>
      tabs.map((tab) => ({
        id: tab.key,
        label: getFallbackTabOptionLabel(tab),
        description: getFallbackTabOptionDescription(tab),
      })),
    [tabs]
  );

  const handleCreateDraftTab = useCallback(() => {
    openWorkspaceDraftTab();
  }, [openWorkspaceDraftTab]);

  const handleCreateTerminal = useCallback(() => {
    if (createTerminalMutation.isPending) {
      return;
    }
    if (!normalizedWorkspaceId.startsWith("/")) {
      return;
    }
    createTerminalMutation.mutate();
  }, [createTerminalMutation, normalizedWorkspaceId]);

  const handleSelectSwitcherTab = useCallback(
    (key: string) => {
      navigateToTabId(key);
    },
    [navigateToTabId]
  );

  const handleSelectNewTabOption = useCallback(
    (key: typeof NEW_TAB_AGENT_OPTION_ID) => {
      if (key === NEW_TAB_AGENT_OPTION_ID) {
        handleCreateDraftTab();
      }
    },
    [handleCreateDraftTab]
  );

  const runCloseFlowForTab = useCallback(
    async (input: { tabId: string; action: () => Promise<void> }): Promise<void> => {
      const normalizedTabId = input.tabId.trim();
      if (!normalizedTabId || pendingCloseTabIdsRef.current.has(normalizedTabId)) {
        return;
      }

      pendingCloseTabIdsRef.current.add(normalizedTabId);
      try {
        await input.action();
      } finally {
        pendingCloseTabIdsRef.current.delete(normalizedTabId);
      }
    },
    []
  );

  const handleCloseTerminalTab = useCallback(
    async (input: { tabId: string; terminalId: string }) => {
      const { tabId, terminalId } = input;
      await runCloseFlowForTab({
        tabId,
        action: async () => {
          if (
            killTerminalMutation.isPending &&
            killTerminalMutation.variables === terminalId
          ) {
            return;
          }

          const confirmed = await confirmDialog({
            title: "Close terminal?",
            message: "Any running process in this terminal will be stopped immediately.",
            confirmLabel: "Close",
            cancelLabel: "Cancel",
            destructive: true,
          });
          if (!confirmed) {
            return;
          }

          await killTerminalMutation.mutateAsync(terminalId);
          setHoveredTabKey((current) => (current === tabId ? null : current));
          setHoveredCloseTabKey((current) => (current === tabId ? null : current));

          queryClient.setQueryData<ListTerminalsPayload>(
            terminalsQueryKey,
            (current) => {
              if (!current) {
                return current;
              }
              return {
                ...current,
                terminals: current.terminals.filter(
                  (terminal) => terminal.id !== terminalId
                ),
              };
            }
          );

          if (persistenceKey) {
            closeWorkspaceTab(persistenceKey, tabId);
          }
        },
      });
    },
    [
      closeWorkspaceTab,
      killTerminalMutation,
      persistenceKey,
      queryClient,
      runCloseFlowForTab,
      terminalsQueryKey,
    ]
  );

  const handleCloseAgentTab = useCallback(
    async (input: { tabId: string; agentId: string }) => {
      const { tabId, agentId } = input;
      await runCloseFlowForTab({
        tabId,
        action: async () => {
          if (
            !normalizedServerId ||
            isArchivingAgent({ serverId: normalizedServerId, agentId })
          ) {
            return;
          }

          const confirmed = await confirmDialog({
            title: "Archive agent?",
            message: "This closes the tab and archives the agent.",
            confirmLabel: "Archive",
            cancelLabel: "Cancel",
            destructive: true,
          });
          if (!confirmed) {
            return;
          }

          await archiveAgent({ serverId: normalizedServerId, agentId });
          setHoveredTabKey((current) => (current === tabId ? null : current));
          setHoveredCloseTabKey((current) => (current === tabId ? null : current));
          if (persistenceKey) {
            closeWorkspaceTab(persistenceKey, tabId);
          }
        },
      });
    },
    [
      archiveAgent,
      closeWorkspaceTab,
      isArchivingAgent,
      normalizedServerId,
      persistenceKey,
      runCloseFlowForTab,
    ]
  );

  const handleCloseDraftOrFileTab = useCallback(
    function handleCloseDraftOrFileTab(tabId: string) {
      setHoveredTabKey((current) => (current === tabId ? null : current));
      setHoveredCloseTabKey((current) => (current === tabId ? null : current));
      if (persistenceKey) {
        closeWorkspaceTab(persistenceKey, tabId);
      }
    },
    [closeWorkspaceTab, persistenceKey]
  );

  const handleCloseTabById = useCallback(
    async (tabId: string) => {
      const tab = allTabDescriptorsById.get(tabId);
      if (!tab) {
        return;
      }
      if (tab.target.kind === "terminal") {
        await handleCloseTerminalTab({ tabId, terminalId: tab.target.terminalId });
        return;
      }
      if (tab.target.kind === "agent") {
        await handleCloseAgentTab({ tabId, agentId: tab.target.agentId });
        return;
      }
      handleCloseDraftOrFileTab(tabId);
    },
    [allTabDescriptorsById, handleCloseAgentTab, handleCloseDraftOrFileTab, handleCloseTerminalTab]
  );

  const handleCopyAgentId = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      try {
        await Clipboard.setStringAsync(agentId);
        toast.copied("Agent ID");
      } catch {
        toast.error("Copy failed");
      }
    },
    [toast]
  );

  const handleCopyResumeCommand = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const agent = sessionAgents?.get(agentId) ?? null;
      const providerSessionId =
        agent?.runtimeInfo?.sessionId ?? agent?.persistence?.sessionId ?? null;
      if (!agent || !providerSessionId) {
        toast.error("Resume ID not available");
        return;
      }

      const command =
        buildProviderCommand({
          provider: agent.provider,
          id: "resume",
          sessionId: providerSessionId,
        }) ?? null;
      if (!command) {
        toast.error("Resume command not available");
        return;
      }
      try {
        await Clipboard.setStringAsync(command);
        toast.copied("resume command");
      } catch {
        toast.error("Copy failed");
      }
    },
    [sessionAgents, toast]
  );

  const handleCopyWorkspacePath = useCallback(async () => {
    if (!normalizedWorkspaceId.startsWith("/")) {
      toast.error("Workspace path not available");
      return;
    }

    try {
      await Clipboard.setStringAsync(normalizedWorkspaceId);
      toast.copied("Workspace path");
    } catch {
      toast.error("Copy failed");
    }
  }, [normalizedWorkspaceId, toast]);

  const handleCopyBranchName = useCallback(async () => {
    if (!currentBranchName) {
      toast.error("Branch name not available");
      return;
    }

    try {
      await Clipboard.setStringAsync(currentBranchName);
      toast.copied("Branch name");
    } catch {
      toast.error("Copy failed");
    }
  }, [currentBranchName, toast]);

  const handleBulkCloseTabs = useCallback(
    async (input: { tabsToClose: WorkspaceTabDescriptor[]; title: string; logLabel: string }) => {
      const { tabsToClose, title, logLabel } = input;
      if (tabsToClose.length === 0) {
        return;
      }

      const groups = classifyBulkClosableTabs(tabsToClose);
      const confirmed = await confirmDialog({
        title,
        message: buildBulkCloseConfirmationMessage(groups),
        confirmLabel: "Close",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      for (const { tabId, terminalId } of groups.terminalTabs) {
        try {
          await killTerminalMutation.mutateAsync(terminalId);
          queryClient.setQueryData<ListTerminalsPayload>(terminalsQueryKey, (current) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              terminals: current.terminals.filter((terminal) => terminal.id !== terminalId),
            };
          });
          if (persistenceKey) {
            closeWorkspaceTab(persistenceKey, tabId);
          }
        } catch (error) {
          console.warn(`[WorkspaceScreen] Failed to close terminal tab ${logLabel}`, { terminalId, error });
        }
      }

      for (const { tabId, agentId } of groups.agentTabs) {
        if (!normalizedServerId) {
          continue;
        }
        try {
          await archiveAgent({ serverId: normalizedServerId, agentId });
          if (persistenceKey) {
            closeWorkspaceTab(persistenceKey, tabId);
          }
        } catch (error) {
          console.warn(`[WorkspaceScreen] Failed to archive agent tab ${logLabel}`, { agentId, error });
        }
      }

      for (const { tabId } of groups.otherTabs) {
        if (persistenceKey) {
          closeWorkspaceTab(persistenceKey, tabId);
        }
      }

      const closedKeys = new Set(tabsToClose.map((tab) => tab.key));
      setHoveredTabKey((current) => (current && closedKeys.has(current) ? null : current));
      setHoveredCloseTabKey((current) => (current && closedKeys.has(current) ? null : current));
    },
    [
      archiveAgent,
      closeWorkspaceTab,
      killTerminalMutation,
      normalizedServerId,
      persistenceKey,
      queryClient,
      terminalsQueryKey,
    ]
  );

  const handleCloseTabsToLeftInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const index = paneTabs.findIndex((tab) => tab.tabId === tabId);
      if (index < 0) {
        return;
      }
      await handleBulkCloseTabs({
        tabsToClose: paneTabs.slice(0, index),
        title: "Close tabs to the left?",
        logLabel: "to the left",
      });
    },
    [handleBulkCloseTabs]
  );

  const handleCloseTabsToLeft = useCallback(
    async (tabId: string) => {
      await handleCloseTabsToLeftInPane(tabId, tabs);
    },
    [handleCloseTabsToLeftInPane, tabs]
  );

  const handleCloseTabsToRightInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const index = paneTabs.findIndex((tab) => tab.tabId === tabId);
      if (index < 0) {
        return;
      }
      await handleBulkCloseTabs({
        tabsToClose: paneTabs.slice(index + 1),
        title: "Close tabs to the right?",
        logLabel: "to the right",
      });
    },
    [handleBulkCloseTabs]
  );

  const handleCloseTabsToRight = useCallback(
    async (tabId: string) => {
      await handleCloseTabsToRightInPane(tabId, tabs);
    },
    [handleCloseTabsToRightInPane, tabs]
  );

  const handleCloseOtherTabsInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const tabsToClose = paneTabs.filter((tab) => tab.tabId !== tabId);
      await handleBulkCloseTabs({
        tabsToClose,
        title: "Close other tabs?",
        logLabel: "from close other tabs",
      });
    },
    [handleBulkCloseTabs]
  );

  const handleCloseOtherTabs = useCallback(
    async (tabId: string) => {
      await handleCloseOtherTabsInPane(tabId, tabs);
    },
    [handleCloseOtherTabsInPane, tabs]
  );

  const handleWorkspaceTabAction = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      switch (action.id) {
        case "workspace.tab.new":
          handleCreateDraftTab();
          return true;
        case "workspace.tab.close-current":
          if (activeTabId) {
            void handleCloseTabById(activeTabId);
          }
          return true;
        case "workspace.tab.navigate-index": {
          const next = tabs[action.index - 1] ?? null;
          if (next?.tabId) {
            navigateToTabId(next.tabId);
          }
          return true;
        }
        case "workspace.tab.navigate-relative": {
          if (tabs.length > 0) {
            const currentIndex = tabs.findIndex((tab) => tab.tabId === activeTabId);
            const fromIndex = currentIndex >= 0 ? currentIndex : 0;
            const nextIndex = (fromIndex + action.delta + tabs.length) % tabs.length;
            const next = tabs[nextIndex] ?? null;
            if (next?.tabId) {
              navigateToTabId(next.tabId);
            }
          }
          return true;
        }
        default:
          return false;
      }
    },
    [activeTabId, handleCloseTabById, handleCreateDraftTab, navigateToTabId, tabs]
  );

  const handleWorkspacePaneAction = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      if (!persistenceKey || !workspaceLayout) {
        return true;
      }

      const focusedPane = getFocusedPane(workspaceLayout);
      if (!focusedPane) {
        return true;
      }

      if (action.id === "workspace.pane.split.right") {
        const activePaneTabId = getFocusedPaneActiveTabId(focusedPane);
        if (activePaneTabId) {
          splitWorkspacePane(persistenceKey, {
            tabId: activePaneTabId,
            targetPaneId: focusedPane.id,
            position: "right",
          });
        }
        return true;
      }

      if (action.id === "workspace.pane.split.down") {
        const activePaneTabId = getFocusedPaneActiveTabId(focusedPane);
        if (activePaneTabId) {
          splitWorkspacePane(persistenceKey, {
            tabId: activePaneTabId,
            targetPaneId: focusedPane.id,
            position: "bottom",
          });
        }
        return true;
      }

      if (
        action.id === "workspace.pane.focus.left" ||
        action.id === "workspace.pane.focus.right" ||
        action.id === "workspace.pane.focus.up" ||
        action.id === "workspace.pane.focus.down"
      ) {
        const direction = action.id.split(".").pop();
        if (
          direction === "left" ||
          direction === "right" ||
          direction === "up" ||
          direction === "down"
        ) {
          const adjacentPaneId = findAdjacentPane(workspaceLayout.root, focusedPane.id, direction);
          if (adjacentPaneId) {
            focusWorkspacePane(persistenceKey, adjacentPaneId);
          }
        }
        return true;
      }

      if (
        action.id === "workspace.pane.move-tab.left" ||
        action.id === "workspace.pane.move-tab.right" ||
        action.id === "workspace.pane.move-tab.up" ||
        action.id === "workspace.pane.move-tab.down"
      ) {
        const direction = action.id.split(".").pop();
        if (
          direction === "left" ||
          direction === "right" ||
          direction === "up" ||
          direction === "down"
        ) {
          const activePaneTabId = getFocusedPaneActiveTabId(focusedPane);
          const adjacentPaneId = findAdjacentPane(workspaceLayout.root, focusedPane.id, direction);
          if (activePaneTabId && adjacentPaneId) {
            moveWorkspaceTabToPane(persistenceKey, activePaneTabId, adjacentPaneId);
          }
        }
        return true;
      }

      if (action.id === "workspace.pane.close") {
        for (const tabId of focusedPane.tabIds) {
          closeWorkspaceTab(persistenceKey, tabId);
        }
        return true;
      }

      return false;
    },
    [
      closeWorkspaceTab,
      focusWorkspacePane,
      moveWorkspaceTabToPane,
      persistenceKey,
      splitWorkspacePane,
      workspaceLayout,
    ]
  );

  useKeyboardActionHandler({
    handlerId: `workspace-tab-actions:${normalizedServerId}:${normalizedWorkspaceId}`,
    actions: [
      "workspace.tab.new",
      "workspace.tab.close-current",
      "workspace.tab.navigate-index",
      "workspace.tab.navigate-relative",
    ] as const,
    enabled: Boolean(normalizedServerId && normalizedWorkspaceId),
    priority: 100,
    isActive: () => isScreenFocused,
    handle: handleWorkspaceTabAction,
  });

  useKeyboardActionHandler({
    handlerId: `workspace-pane-actions:${normalizedServerId}:${normalizedWorkspaceId}`,
    actions: [
      "workspace.pane.split.right",
      "workspace.pane.split.down",
      "workspace.pane.focus.left",
      "workspace.pane.focus.right",
      "workspace.pane.focus.up",
      "workspace.pane.focus.down",
      "workspace.pane.move-tab.left",
      "workspace.pane.move-tab.right",
      "workspace.pane.move-tab.up",
      "workspace.pane.move-tab.down",
      "workspace.pane.close",
    ] as const,
    enabled: Boolean(normalizedServerId && normalizedWorkspaceId),
    priority: 100,
    isActive: () => isScreenFocused,
    handle: handleWorkspacePaneAction,
  });

  const activeTabDescriptor = activeTab?.descriptor ?? null;
  const content = shouldRenderMissingWorkspaceDescriptor({
    workspace: workspaceDescriptor,
    hasHydratedWorkspaces,
  }) ? (
    <View style={styles.emptyState}>
      <ActivityIndicator color={theme.colors.foregroundMuted} />
    </View>
  ) : !activeTabDescriptor ? (
    !hasHydratedAgents ? (
      <View style={styles.emptyState}>
        <ActivityIndicator color={theme.colors.foregroundMuted} />
      </View>
    ) : (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>
          No tabs are available yet. Use New tab to create an agent or terminal.
        </Text>
      </View>
    )
  ) : (
    <WorkspacePaneContent
      tab={activeTabDescriptor}
      normalizedServerId={normalizedServerId}
      normalizedWorkspaceId={normalizedWorkspaceId}
      onOpenTab={(target) => {
        if (!persistenceKey) {
          return;
        }
        const tabId = openWorkspaceTab(persistenceKey, target);
        if (tabId) {
          navigateToTabId(tabId);
        }
      }}
      onCloseCurrentTab={() => {
        if (activeTabDescriptor.tabId) {
          void handleCloseTabById(activeTabDescriptor.tabId);
        }
      }}
      onRetargetCurrentTab={(target) => {
        if (!persistenceKey) {
          return;
        }
        retargetWorkspaceTab(persistenceKey, activeTabDescriptor.tabId, target);
      }}
      onOpenWorkspaceFile={(filePath) => {
        handleOpenFileFromChat({ filePath });
      }}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: mainBackgroundColor }]}>
      <View style={styles.threePaneRow}>
        <View style={styles.centerColumn}>
          <ScreenHeader
            left={
              <>
                <SidebarMenuToggle />
                <View style={styles.headerTitleContainer}>
                  {isWorkspaceHeaderLoading ? (
                    <>
                      <View style={styles.headerTitleSkeleton} />
                      <View style={styles.headerProjectTitleSkeleton} />
                    </>
                  ) : (
                    <>
                      <Text
                        testID="workspace-header-title"
                        style={styles.headerTitle}
                        numberOfLines={1}
                      >
                        {workspaceHeader.title}
                      </Text>
                      <Text
                        testID="workspace-header-subtitle"
                        style={styles.headerProjectTitle}
                        numberOfLines={1}
                      >
                        {workspaceHeader.subtitle}
                      </Text>
                    </>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      testID="workspace-header-menu-trigger"
                      style={styles.headerActionButton}
                      accessibilityRole="button"
                      accessibilityLabel="Workspace actions"
                    >
                      {({ hovered, open }) => {
                        const Icon = isMobile ? EllipsisVertical : Ellipsis;
                        return (
                          <Icon
                            size={theme.iconSize.md}
                            color={hovered || open ? theme.colors.foreground : theme.colors.foregroundMuted}
                          />
                        );
                      }}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      width={220}
                      testID="workspace-header-menu"
                    >
                      <DropdownMenuItem
                        testID="workspace-header-new-terminal"
                        leading={
                          <SquareTerminal
                            size={16}
                            color={theme.colors.foregroundMuted}
                          />
                        }
                        disabled={createTerminalMutation.isPending}
                        onSelect={handleCreateTerminal}
                      >
                        New terminal
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        testID="workspace-header-copy-path"
                        leading={
                          <Copy
                            size={16}
                            color={theme.colors.foregroundMuted}
                          />
                        }
                        disabled={!normalizedWorkspaceId.startsWith("/")}
                        onSelect={handleCopyWorkspacePath}
                      >
                        Copy workspace path
                      </DropdownMenuItem>
                      {currentBranchName ? (
                        <DropdownMenuItem
                          testID="workspace-header-copy-branch-name"
                          leading={
                            <Copy
                              size={16}
                              color={theme.colors.foregroundMuted}
                            />
                          }
                          onSelect={handleCopyBranchName}
                        >
                          Copy branch name
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </View>
              </>
            }
            right={
              <View style={styles.headerRight}>
                {!isMobile && isGitCheckout ? (
                  <>
                    <WorkspaceGitActions
                      serverId={normalizedServerId}
                      cwd={normalizedWorkspaceId}
                    />
                    <Pressable
                      testID="workspace-explorer-toggle"
                      onPress={handleToggleExplorer}
                      accessibilityRole="button"
                      accessibilityLabel={isExplorerOpen ? "Close explorer" : "Open explorer"}
                      accessibilityState={{ expanded: isExplorerOpen }}
                      style={({ hovered, pressed }) => [
                        styles.sourceControlButton,
                        workspaceDescriptor?.diffStat && styles.sourceControlButtonWithStats,
                        (hovered || pressed || isExplorerOpen) && styles.sourceControlButtonHovered,
                      ]}
                    >
                      {({ hovered, pressed }) => {
                        const active = isExplorerOpen || hovered || pressed;
                        const iconColor = active ? theme.colors.foreground : theme.colors.foregroundMuted;
                        return (
                          <>
                            <SourceControlPanelIcon size={theme.iconSize.md} color={iconColor} />
                            {workspaceDescriptor?.diffStat ? (
                              <View style={styles.diffStatRow}>
                                <Text style={styles.diffStatAdditions}>+{workspaceDescriptor.diffStat.additions}</Text>
                                <Text style={styles.diffStatDeletions}>-{workspaceDescriptor.diffStat.deletions}</Text>
                              </View>
                            ) : null}
                          </>
                        );
                      }}
                    </Pressable>
                  </>
                ) : null}
                {!isMobile && !isGitCheckout ? (
                  <HeaderToggleButton
                    testID="workspace-explorer-toggle"
                    onPress={handleToggleExplorer}
                    tooltipLabel="Toggle explorer"
                    tooltipKeys={["mod", "E"]}
                    tooltipSide="left"
                    style={styles.headerActionButton}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={isExplorerOpen ? "Close explorer" : "Open explorer"}
                    accessibilityState={{ expanded: isExplorerOpen }}
                  >
                    {({ hovered }) => {
                      const color = isExplorerOpen || hovered ? theme.colors.foreground : theme.colors.foregroundMuted;
                      return <PanelRight size={theme.iconSize.md} color={color} />;
                    }}
                  </HeaderToggleButton>
                ) : null}
                {isMobile ? (
                  <HeaderToggleButton
                    testID="workspace-explorer-toggle"
                    onPress={handleToggleExplorer}
                    tooltipLabel="Toggle explorer"
                    tooltipKeys={["mod", "E"]}
                    tooltipSide="left"
                    style={styles.headerActionButton}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={isExplorerOpen ? "Close explorer" : "Open explorer"}
                    accessibilityState={{ expanded: isExplorerOpen }}
                  >
                    {({ hovered }) => {
                      const color = isExplorerOpen || hovered ? theme.colors.foreground : theme.colors.foregroundMuted;
                      return isGitCheckout
                        ? <SourceControlPanelIcon size={theme.iconSize.lg} color={color} strokeWidth={1.5} />
                        : <PanelRight size={theme.iconSize.lg} color={color} />;
                    }}
                  </HeaderToggleButton>
                ) : null}
              </View>
            }
          />

          {isMobile ? (
            <MobileWorkspaceTabSwitcher
              tabs={tabs}
              activeTabKey={activeTabKey}
              activeTab={activeTabDescriptor}
              tabSwitcherOptions={tabSwitcherOptions}
              tabByKey={tabByKey}
              normalizedServerId={normalizedServerId}
              normalizedWorkspaceId={normalizedWorkspaceId}
              onSelectSwitcherTab={handleSelectSwitcherTab}
              onSelectNewTabOption={handleSelectNewTabOption}
              onCopyResumeCommand={handleCopyResumeCommand}
              onCopyAgentId={handleCopyAgentId}
              onCloseTab={handleCloseTabById}
              onCloseTabsAbove={handleCloseTabsToLeft}
              onCloseTabsBelow={handleCloseTabsToRight}
              onCloseOtherTabs={handleCloseOtherTabs}
            />
          ) : (
            null
          )}

          <View style={styles.centerContent}>
            {isMobile ? (
              <GestureDetector gesture={explorerOpenGesture} touchAction="pan-y">
                <View style={styles.content}>{content}</View>
              </GestureDetector>
            ) : (
              <View style={styles.content}>
                {workspaceLayout && persistenceKey ? (
                  <SplitContainer
                    layout={workspaceLayout}
                    workspaceKey={persistenceKey}
                    normalizedServerId={normalizedServerId}
                    normalizedWorkspaceId={normalizedWorkspaceId}
                    uiTabs={uiTabs}
                    hoveredCloseTabKey={hoveredCloseTabKey}
                    setHoveredTabKey={setHoveredTabKey}
                    setHoveredCloseTabKey={setHoveredCloseTabKey}
                    isArchivingAgent={isArchivingAgent}
                    killTerminalPending={killTerminalMutation.isPending}
                    killTerminalId={killTerminalMutation.variables ?? null}
                    onNavigateTab={navigateToTabId}
                    onCloseTab={handleCloseTabById}
                    onCopyResumeCommand={handleCopyResumeCommand}
                    onCopyAgentId={handleCopyAgentId}
                    onCloseTabsToLeft={handleCloseTabsToLeftInPane}
                    onCloseTabsToRight={handleCloseTabsToRightInPane}
                    onCloseOtherTabs={handleCloseOtherTabsInPane}
                    onSelectNewTabOption={handleSelectNewTabOption}
                    newTabAgentOptionId={NEW_TAB_AGENT_OPTION_ID}
                    onOpenPaneTab={({ paneId, target }) => {
                      focusWorkspacePane(persistenceKey, paneId);
                      const tabId = openWorkspaceTab(persistenceKey, target);
                      if (tabId) {
                        navigateToTabId(tabId);
                      }
                    }}
                    onRetargetTab={(tabId, target) => {
                      retargetWorkspaceTab(persistenceKey, tabId, target);
                    }}
                    onOpenWorkspaceFile={({ paneId, filePath }) => {
                      focusWorkspacePane(persistenceKey, paneId);
                      const tabId = openWorkspaceTab(persistenceKey, { kind: "file", path: filePath });
                      if (tabId) {
                        navigateToTabId(tabId);
                      }
                    }}
                    onFocusPane={(paneId) => {
                      focusWorkspacePane(persistenceKey, paneId);
                    }}
                    onSplitPane={(input) => {
                      splitWorkspacePane(persistenceKey, input);
                    }}
                    onMoveTabToPane={(tabId, toPaneId) => {
                      moveWorkspaceTabToPane(persistenceKey, tabId, toPaneId);
                    }}
                    onResizeSplit={(groupId, sizes) => {
                      resizeWorkspaceSplit(persistenceKey, groupId, sizes);
                    }}
                    onReorderTabsInPane={(paneId, tabIds) => {
                      reorderWorkspaceTabsInPane(persistenceKey, paneId, tabIds);
                    }}
                    renderPaneEmptyState={() => (
                      <View style={styles.emptyState}>
                        <Text style={styles.emptyStateText}>No tabs in this pane.</Text>
                      </View>
                    )}
                  />
                ) : (
                  content
                )}
              </View>
            )}
          </View>
        </View>

        <ExplorerSidebar
          serverId={normalizedServerId}
          workspaceId={normalizedWorkspaceId}
          workspaceRoot={normalizedWorkspaceId}
          isGit={isGitCheckout}
          onOpenFile={handleOpenFileFromExplorer}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  threePaneRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "stretch",
  },
  centerColumn: {
    flex: 1,
    minHeight: 0,
  },
  headerTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: {
      xs: "400",
      md: "300",
    },
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  headerTitleContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  headerProjectTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    flexShrink: 1,
  },
  headerTitleSkeleton: {
    width: 190,
    maxWidth: "45%",
    height: 22,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    opacity: 0.25,
  },
  headerProjectTitleSkeleton: {
    width: 300,
    maxWidth: "45%",
    height: 22,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    opacity: 0.18,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: {
      xs: theme.spacing[1],
      md: theme.spacing[2],
    },
  },
  headerActionButton: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  sourceControlButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    minHeight: Math.ceil(theme.fontSize.sm * 1.5) + theme.spacing[1] * 2,
    minWidth: Math.ceil(theme.fontSize.sm * 1.5) + theme.spacing[1] * 2,
    borderRadius: theme.borderRadius.md,
  },
  sourceControlButtonWithStats: {
    paddingHorizontal: theme.spacing[3],
  },
  sourceControlButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  diffStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  diffStatAdditions: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.palette.green[400],
  },
  diffStatDeletions: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.palette.red[500],
  },
  newTabActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  newTabActionButton: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  newTabActionButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  newTabTooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.popoverForeground,
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
  mobileTabsRow: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  mobileTabsActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  switcherTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    justifyContent: "space-between",
  },
  switcherTriggerActive: {
    backgroundColor: theme.colors.surface2,
  },
  switcherTriggerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  switcherTriggerIcon: {
    flexShrink: 0,
  },
  switcherTriggerText: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  mobileTabMenuTrigger: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileTabMenuTriggerActive: {
    backgroundColor: theme.colors.surface2,
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
  },
  tabsScroll: {
    flex: 1,
    minWidth: 0,
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
  centerContent: {
    flex: 1,
    minHeight: 0,
  },
  tab: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: 260,
  },
  tabHandle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  tabIcon: {
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: theme.colors.surface2,
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
  tabCloseButtonHidden: {
    opacity: 0,
  },
  tabCloseButtonActive: {
    backgroundColor: theme.colors.surface3,
  },
  content: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  contentPlaceholder: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  emptyStateText: {
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
}));
