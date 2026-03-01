import {
  View,
  Text,
  Pressable,
  Image,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useQueries } from "@tanstack/react-query";
import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  type ReactElement,
  type MutableRefObject,
} from "react";
import { router, usePathname } from "expo-router";
import {
  StyleSheet,
  UnistylesRuntime,
  useUnistyles,
} from "react-native-unistyles";
import { type GestureType } from "react-native-gesture-handler";
import { Archive, Check, X } from "lucide-react-native";
import {
  DraggableList,
  type DraggableRenderItemInfo,
} from "./draggable-list";
import {
  getHostRuntimeStore,
  isHostRuntimeConnected,
} from "@/runtime/host-runtime";
import {
  buildAgentNavigationKey,
  startNavigationTiming,
} from "@/utils/navigation-timing";
import {
  buildHostAgentDetailRoute,
  parseHostAgentRouteFromPathname,
} from "@/utils/host-routes";
import { projectIconQueryKey } from "@/hooks/use-project-icon-query";
import {
  type SidebarAgentListEntry,
  type SidebarProjectFilterOption,
} from "@/hooks/use-sidebar-agents-list";
import type { ProjectIcon } from "@server/shared/messages";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { getIsTauri } from "@/constants/layout";
import { AgentStatusDot } from "@/components/agent-status-dot";
import { Combobox } from "@/components/ui/combobox";
import { parseSidebarAgentKey } from "@/utils/sidebar-shortcuts";
import { parseRepoNameFromRemoteUrl } from "@/utils/agent-grouping";
import { formatTimeAgo } from "@/utils/time";
import { isSidebarActiveAgent } from "@/utils/sidebar-agent-state";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";

type EntryData = SidebarAgentListEntry;

function toProjectIconDataUri(icon: ProjectIcon | null): string | null {
  if (!icon) {
    return null;
  }
  return `data:${icon.mimeType};base64,${icon.data}`;
}

interface SidebarAgentListProps {
  isOpen?: boolean;
  entries: SidebarAgentListEntry[];
  projectFilterOptions: SidebarProjectFilterOption[];
  selectedProjectFilterKey: string | null;
  onSelectedProjectFilterKeyChange: (key: string | null) => void;
  isProjectFilterOpen: boolean;
  onProjectFilterOpenChange: (open: boolean) => void;
  projectFilterAnchorRef: MutableRefObject<View | null>;
  serverId: string | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  selectedAgentId?: string;
  onAgentSelect?: () => void;
  listFooterComponent?: ReactElement | null;
  /** Gesture ref for coordinating with parent gestures (e.g., sidebar close) */
  parentGestureRef?: MutableRefObject<GestureType | undefined>;
}

interface ProjectFilterOptionRowProps {
  option: SidebarProjectFilterOption;
  selected: boolean;
  iconDataUri: string | null;
  displayName: string;
  onSelect: (projectKey: string) => void;
}

function ProjectFilterOptionRow({
  option,
  selected,
  iconDataUri,
  displayName,
  onSelect,
}: ProjectFilterOptionRowProps) {
  return (
    <Pressable
      style={({ pressed, hovered = false }) => [
        styles.filterOption,
        selected && styles.filterOptionSelected,
        hovered && styles.filterOptionHovered,
        pressed && styles.filterOptionPressed,
      ]}
      onPress={() => onSelect(option.projectKey)}
    >
      <View style={styles.filterOptionLeft}>
        {iconDataUri ? (
          <Image
            source={{ uri: iconDataUri }}
            style={styles.projectIcon}
          />
        ) : (
          <View style={styles.projectIconFallback}>
            <Text style={styles.projectIconFallbackText}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.filterOptionLabel} numberOfLines={1}>
          {displayName}
        </Text>
      </View>

      <View style={styles.filterOptionRight}>
        {option.activeCount > 0 ? (
          <Text style={styles.filterOptionCount}>{option.activeCount}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

interface SidebarAgentRowProps {
  entry: SidebarAgentListEntry;
  projectDisplayName: string;
  projectIconDataUri: string | null;
  isSelected: boolean;
  isInSelectionMode: boolean;
  isBatchSelected: boolean;
  isArchiving: boolean;
  shortcutNumber: number | null;
  onPress: () => void;
  onLongPress: () => void;
  onArchive: () => Promise<void>;
}

function resolveBranchLabel(entry: SidebarAgentListEntry): string | null {
  const checkout = entry.project.checkout;
  if (!checkout.isGit) {
    return null;
  }
  const branch = checkout.currentBranch;
  if (!branch || branch === "HEAD" || branch === "main") {
    return null;
  }
  return branch;
}

function SidebarAgentRow({
  entry,
  projectDisplayName,
  projectIconDataUri,
  isSelected,
  isInSelectionMode,
  isBatchSelected,
  isArchiving,
  shortcutNumber,
  onPress,
  onLongPress,
  onArchive,
}: SidebarAgentRowProps) {
  const { theme } = useUnistyles();
  const [isHovered, setIsHovered] = useState(false);
  const [isArchiveHovered, setIsArchiveHovered] = useState(false);
  const [isArchiveConfirmVisible, setIsArchiveConfirmVisible] = useState(false);
  const hoverOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const branchLabel = resolveBranchLabel(entry);
  const relativeCreatedAt = formatTimeAgo(entry.agent.createdAt);
  const isActive = isSidebarActiveAgent({
    status: entry.agent.status,
    pendingPermissionCount: entry.agent.pendingPermissionCount,
    requiresAttention: entry.agent.requiresAttention,
    attentionReason: entry.agent.attentionReason,
  });
  const shouldApplyInactiveStyles = !isActive && !isSelected;
  const showArchive =
    !isInSelectionMode &&
    shortcutNumber === null &&
    (isHovered || isArchiveHovered || isArchiveConfirmVisible || isArchiving);

  const clearHoverOutTimeout = useCallback(() => {
    if (!hoverOutTimeoutRef.current) {
      return;
    }
    clearTimeout(hoverOutTimeoutRef.current);
    hoverOutTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    return () => clearHoverOutTimeout();
  }, [clearHoverOutTimeout]);

  useEffect(() => {
    if (!isArchiving) {
      setIsArchiveConfirmVisible(false);
    }
  }, [isArchiving]);

  const handleHoverIn = useCallback(() => {
    clearHoverOutTimeout();
    setIsHovered(true);
  }, [clearHoverOutTimeout]);

  const handleHoverOut = useCallback(() => {
    clearHoverOutTimeout();
    hoverOutTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
      setIsArchiveHovered(false);
      setIsArchiveConfirmVisible(false);
    }, 50);
  }, [clearHoverOutTimeout]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.agentItem,
        isSelected && styles.agentItemSelected,
        isHovered && styles.agentItemHovered,
        pressed && styles.agentItemPressed,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={200}
      onPressIn={() => {
        if (Platform.OS !== "web") {
          return;
        }
        handleHoverIn();
      }}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      testID={`agent-row-${entry.agent.serverId}-${entry.agent.id}`}
    >
      <View style={styles.agentRowTop}>
        <AgentStatusDot
          status={entry.agent.status}
          requiresAttention={entry.agent.requiresAttention}
        />

        <Text
          style={[
            styles.agentTitle,
            shouldApplyInactiveStyles && styles.agentTitleInactive,
            isSelected && styles.agentTitleSelected,
          ]}
          numberOfLines={1}
        >
          {entry.agent.title || "New agent"}
        </Text>

        {showArchive ? (
          <Pressable
            onHoverIn={() => {
              clearHoverOutTimeout();
              setIsHovered(true);
              setIsArchiveHovered(true);
            }}
            onHoverOut={() => {
              setIsArchiveHovered(false);
            }}
            onPress={(event) => {
              event.stopPropagation();
              if (isArchiving) {
                return;
              }
              if (!isArchiveConfirmVisible) {
                setIsArchiveConfirmVisible(true);
                return;
              }
              void onArchive();
            }}
            style={styles.archiveButton}
            disabled={isArchiving}
            testID={
              isArchiveConfirmVisible || isArchiving
                ? `agent-archive-confirm-${entry.agent.serverId}-${entry.agent.id}`
                : `agent-archive-${entry.agent.serverId}-${entry.agent.id}`
            }
          >
            {({ hovered: archiveHovered }) =>
              isArchiving ? (
                <ActivityIndicator size="small" color={theme.colors.foreground} />
              ) : isArchiveConfirmVisible ? (
                <Check size={theme.iconSize.xs} color={theme.colors.foreground} />
              ) : (
                <Archive
                  size={theme.iconSize.xs}
                  color={
                    archiveHovered
                      ? theme.colors.foreground
                      : theme.colors.foregroundMuted
                  }
                />
              )
            }
          </Pressable>
        ) : (
          <Text style={styles.relativeTimeText}>{relativeCreatedAt}</Text>
        )}

        {shortcutNumber !== null && !isInSelectionMode ? (
          <View style={styles.shortcutBadge}>
            <Text style={styles.shortcutBadgeText}>{shortcutNumber}</Text>
          </View>
        ) : null}

      </View>

      <View style={styles.agentMetaRow}>
        {projectIconDataUri ? (
          <Image
            source={{ uri: projectIconDataUri }}
            style={[
              styles.agentMetaProjectIcon,
              shouldApplyInactiveStyles && styles.agentMetaProjectIconInactive,
            ]}
          />
        ) : (
          <View
            style={[
              styles.projectIconFallback,
              shouldApplyInactiveStyles && styles.projectIconFallbackInactive,
            ]}
          >
            <Text style={styles.projectIconFallbackText}>
              {projectDisplayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.agentMetaProjectName} numberOfLines={1}>
          {projectDisplayName}
        </Text>
        {branchLabel ? (
          <View
            style={[
              styles.agentMetaBranchBadge,
              isSelected && styles.agentMetaBranchBadgeSelected,
            ]}
          >
            <Text style={styles.agentMetaBranchText} numberOfLines={1}>
              {branchLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {isBatchSelected ? (
        <View style={styles.selectionOverlay} pointerEvents="none">
          <Check
            size={theme.iconSize.md}
            color={theme.colors.accentForeground}
            strokeWidth={2.5}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

function deriveShortcutIndexByAgentKey(sidebarShortcutAgentKeys: string[]) {
  const map = new Map<string, number>();
  for (let i = 0; i < sidebarShortcutAgentKeys.length; i += 1) {
    const key = sidebarShortcutAgentKeys[i];
    if (!key) continue;
    map.set(key, i + 1);
  }
  return map;
}

function deriveProjectDisplayName(input: {
  projectKey: string;
  projectName: string;
  remoteUrl: string | null;
}): string {
  const remoteRepoName = parseRepoNameFromRemoteUrl(input.remoteUrl);
  if (remoteRepoName) {
    return remoteRepoName;
  }

  const githubPrefix = "remote:github.com/";
  if (input.projectKey.startsWith(githubPrefix)) {
    return input.projectKey.slice(githubPrefix.length);
  }

  if (input.projectKey.startsWith("remote:")) {
    const withoutPrefix = input.projectKey.slice("remote:".length);
    const slashIdx = withoutPrefix.indexOf("/");
    if (slashIdx >= 0) {
      const remotePath = withoutPrefix.slice(slashIdx + 1).trim();
      if (remotePath.length > 0) {
        return remotePath;
      }
    }
    return withoutPrefix;
  }

  const trimmedProjectName = input.projectName.trim();
  if (trimmedProjectName.length > 0) {
    return trimmedProjectName;
  }

  return input.projectKey;
}

export function SidebarAgentList({
  isOpen = true,
  entries,
  projectFilterOptions,
  selectedProjectFilterKey,
  onSelectedProjectFilterKeyChange,
  isProjectFilterOpen,
  onProjectFilterOpenChange,
  projectFilterAnchorRef,
  serverId,
  isRefreshing = false,
  onRefresh,
  selectedAgentId,
  onAgentSelect,
  listFooterComponent,
  parentGestureRef,
}: SidebarAgentListProps) {
  const { theme } = useUnistyles();
  const pathname = usePathname();
  const isMobile =
    UnistylesRuntime.breakpoint === "xs" || UnistylesRuntime.breakpoint === "sm";
  const showDesktopWebScrollbar = Platform.OS === "web" && !isMobile;

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedBatchKeys, setSelectedBatchKeys] = useState<Set<string>>(new Set());
  const { archiveAgent, isArchivingAgent } = useArchiveAgent();
  const getSidebarOrder = useSidebarOrderStore((state) => state.getOrder);
  const setSidebarOrder = useSidebarOrderStore((state) => state.setOrder);
  const removeSidebarOrderEntry = useSidebarOrderStore((state) => state.remove);

  const altDown = useKeyboardShortcutsStore((s) => s.altDown);
  const cmdOrCtrlDown = useKeyboardShortcutsStore((s) => s.cmdOrCtrlDown);
  const sidebarShortcutAgentKeys = useKeyboardShortcutsStore(
    (s) => s.sidebarShortcutAgentKeys
  );
  const isTauri = getIsTauri();
  const showShortcutBadges = !isSelectionMode && (altDown || (isTauri && cmdOrCtrlDown));
  const shortcutIndexByAgentKey = useMemo(
    () => deriveShortcutIndexByAgentKey(sidebarShortcutAgentKeys),
    [sidebarShortcutAgentKeys]
  );

  const showProjectFilters = projectFilterOptions.length > 0;

  const projectIconRequests = useMemo(() => {
    if (!isOpen) {
      return [];
    }
    const unique = new Map<string, { serverId: string; cwd: string }>();
    for (const option of projectFilterOptions) {
      if (!option.serverId || !option.workingDir) {
        continue;
      }
      unique.set(`${option.serverId}:${option.workingDir}`, {
        serverId: option.serverId,
        cwd: option.workingDir,
      });
    }
    for (const entry of entries) {
      const serverId = entry.agent.serverId;
      const cwd = entry.project.checkout.cwd;
      if (!serverId || !cwd) {
        continue;
      }
      unique.set(`${serverId}:${cwd}`, { serverId, cwd });
    }
    return Array.from(unique.values());
  }, [entries, isOpen, projectFilterOptions]);

  const projectIconQueries = useQueries({
    queries: projectIconRequests.map((request) => ({
      queryKey: projectIconQueryKey(request.serverId, request.cwd),
      queryFn: async () => {
        const client = getHostRuntimeStore().getClient(request.serverId);
        if (!client) {
          return null;
        }
        const result = await client.requestProjectIcon(request.cwd);
        return result.icon;
      },
      select: toProjectIconDataUri,
      enabled: Boolean(
        isOpen &&
          getHostRuntimeStore().getClient(request.serverId) &&
          isHostRuntimeConnected(
            getHostRuntimeStore().getSnapshot(request.serverId)
          ) &&
          request.cwd
      ),
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });

  const projectIconByQueryKey = useMemo(() => {
    const map = new Map<string, string | null>();
    for (let i = 0; i < projectIconRequests.length; i += 1) {
      const request = projectIconRequests[i];
      if (!request) {
        continue;
      }
      const dataUri = projectIconQueries[i]?.data ?? null;
      map.set(`${request.serverId}:${request.cwd}`, dataUri);
    }
    return map;
  }, [projectIconQueries, projectIconRequests]);

  const projectIconByProjectKey = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const option of projectFilterOptions) {
      map.set(
        option.projectKey,
        projectIconByQueryKey.get(`${option.serverId}:${option.workingDir}`) ?? null
      );
    }
    for (const entry of entries) {
      if (map.has(entry.project.projectKey)) {
        continue;
      }
      map.set(
        entry.project.projectKey,
        projectIconByQueryKey.get(
          `${entry.agent.serverId}:${entry.project.checkout.cwd}`
        ) ?? null
      );
    }
    return map;
  }, [entries, projectIconByQueryKey, projectFilterOptions]);

  const handleSelectProject = useCallback(
    (projectKey: string) => {
      onSelectedProjectFilterKeyChange(
        selectedProjectFilterKey === projectKey ? null : projectKey
      );
    },
    [onSelectedProjectFilterKeyChange, selectedProjectFilterKey]
  );

  const handleClearProjectFilter = useCallback(() => {
    onSelectedProjectFilterKeyChange(null);
  }, [onSelectedProjectFilterKeyChange]);

  const handleAgentPress = useCallback(
    (entry: SidebarAgentListEntry) => {
      const key = `${entry.agent.serverId}:${entry.agent.id}`;
      if (isSelectionMode) {
        setSelectedBatchKeys((prev) => {
          const next = new Set(prev);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });
        return;
      }

      const navigationKey = buildAgentNavigationKey(entry.agent.serverId, entry.agent.id);
      startNavigationTiming(navigationKey, {
        from: "home",
        to: "agent",
        params: { serverId: entry.agent.serverId, agentId: entry.agent.id },
      });

      const shouldReplace = Boolean(parseHostAgentRouteFromPathname(pathname));
      const navigate = shouldReplace ? router.replace : router.push;

      onAgentSelect?.();
      navigate(buildHostAgentDetailRoute(entry.agent.serverId, entry.agent.id) as any);
    },
    [isSelectionMode, onAgentSelect, pathname]
  );

  const handleAgentLongPress = useCallback((entry: SidebarAgentListEntry) => {
    const key = `${entry.agent.serverId}:${entry.agent.id}`;
    if (isSelectionMode) {
      setSelectedBatchKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
      return;
    }
    setIsSelectionMode(true);
    setSelectedBatchKeys(new Set([key]));
  }, [isSelectionMode]);

  const handleArchiveSingle = useCallback(
    async (entry: SidebarAgentListEntry): Promise<void> => {
      await archiveAgent({
        serverId: entry.agent.serverId,
        agentId: entry.agent.id,
      })
        .then(() => {
          removeSidebarOrderEntry(
            entry.agent.serverId,
            `${entry.agent.serverId}:${entry.agent.id}`
          );
        })
        .catch((error) => {
          console.warn("[archive_agent] failed", error);
        });
    },
    [archiveAgent, removeSidebarOrderEntry]
  );

  const handleArchiveBatch = useCallback(() => {
    if (selectedBatchKeys.size === 0) {
      setIsSelectionMode(false);
      return;
    }

    const requests: Promise<void>[] = [];
    for (const key of selectedBatchKeys) {
      const parsed = parseSidebarAgentKey(key);
      if (!parsed) {
        continue;
      }
      requests.push(
        archiveAgent({
          serverId: parsed.serverId,
          agentId: parsed.agentId,
        })
          .then(() => {
            removeSidebarOrderEntry(parsed.serverId, key);
          })
          .catch((error) => {
            console.warn("[archive_agent_batch] failed", { key, error });
          })
      );
    }

    void Promise.all(requests).finally(() => {
      setSelectedBatchKeys(new Set());
      setIsSelectionMode(false);
    });
  }, [archiveAgent, removeSidebarOrderEntry, selectedBatchKeys]);

  const handleSelectionBack = useCallback(() => {
    setSelectedBatchKeys(new Set());
    setIsSelectionMode(false);
  }, []);

  const handleListDragBegin = useCallback(() => {
    // No-op: selection mode is resolved in handleDragEnd based on whether
    // the item actually moved. This fires synchronously when drag() is called
    // (i.e., on long press), before we know if the user will drag or release.
  }, []);

  const renderRow = useCallback(
    ({ item, drag }: DraggableRenderItemInfo<EntryData>) => {
      const key = `${item.agent.serverId}:${item.agent.id}`;
      const projectDisplayName = deriveProjectDisplayName({
        projectKey: item.project.projectKey,
        projectName: item.project.projectName,
        remoteUrl: item.project.checkout.remoteUrl,
      });
      return (
        <SidebarAgentRow
          entry={item}
          projectDisplayName={projectDisplayName}
          projectIconDataUri={
            projectIconByProjectKey.get(item.project.projectKey) ?? null
          }
          isSelected={selectedAgentId === key}
          isInSelectionMode={isSelectionMode}
          isBatchSelected={selectedBatchKeys.has(key)}
          isArchiving={isArchivingAgent({
            serverId: item.agent.serverId,
            agentId: item.agent.id,
          })}
          shortcutNumber={
            showShortcutBadges ? (shortcutIndexByAgentKey.get(key) ?? null) : null
          }
          onPress={() => handleAgentPress(item)}
          onLongPress={() => {
            drag();
            handleAgentLongPress(item);
          }}
          onArchive={() => handleArchiveSingle(item)}
        />
      );
    },
    [
      handleAgentLongPress,
      handleAgentPress,
      handleArchiveSingle,
      isArchivingAgent,
      isSelectionMode,
      selectedAgentId,
      selectedBatchKeys,
      shortcutIndexByAgentKey,
      showShortcutBadges,
      projectIconByProjectKey,
    ]
  );

  const keyExtractor = useCallback(
    (entry: EntryData) => `${entry.agent.serverId}:${entry.agent.id}`,
    []
  );
  const handleDragEnd = useCallback(
    (reorderedEntries: SidebarAgentListEntry[]) => {
      if (!serverId) {
        return;
      }
      const reorderedKeys = reorderedEntries.map(
        (entry) => `${entry.agent.serverId}:${entry.agent.id}`
      );
      const currentOrder = getSidebarOrder(serverId);
      const currentVisible = currentOrder.filter((key) =>
        reorderedKeys.includes(key)
      );
      const orderChanged =
        currentVisible.length !== reorderedKeys.length ||
        reorderedKeys.some((key, i) => currentVisible[i] !== key);
      if (!orderChanged) {
        return;
      }
      const reorderedSet = new Set(reorderedKeys);
      const remainder = currentOrder.filter((key) => !reorderedSet.has(key));
      setSidebarOrder(serverId, [...reorderedKeys, ...remainder]);
    },
    [getSidebarOrder, serverId, setSidebarOrder]
  );

  return (
    <View style={styles.container}>
      {showProjectFilters ? (
        <Combobox
          options={[]}
          value=""
          onSelect={() => {}}
          title="Filter by project"
          placeholder="Search projects"
          searchPlaceholder="Search projects"
          desktopPlacement="bottom-start"
          open={isProjectFilterOpen}
          onOpenChange={onProjectFilterOpenChange}
          anchorRef={projectFilterAnchorRef}
        >
          <View style={styles.filterOptionsList}>
            <Pressable
              style={({ pressed, hovered = false }) => [
                styles.filterOption,
                !selectedProjectFilterKey && styles.filterOptionSelected,
                hovered && styles.filterOptionHovered,
                pressed && styles.filterOptionPressed,
              ]}
              onPress={handleClearProjectFilter}
            >
              <Text style={styles.filterOptionLabel}>All projects</Text>
            </Pressable>
            {projectFilterOptions.length === 0 ? (
              <Text style={styles.filterEmptyText}>No projects</Text>
            ) : (
              projectFilterOptions.map((option) => (
                <ProjectFilterOptionRow
                  key={option.projectKey}
                  option={option}
                  selected={selectedProjectFilterKey === option.projectKey}
                  iconDataUri={projectIconByProjectKey.get(option.projectKey) ?? null}
                  displayName={deriveProjectDisplayName({
                    projectKey: option.projectKey,
                    projectName: option.projectName,
                    remoteUrl: null,
                  })}
                  onSelect={handleSelectProject}
                />
              ))
            )}
          </View>
        </Combobox>
      ) : null}

      <DraggableList
        data={entries}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          isSelectionMode ? styles.listContentSelectionMode : null,
        ]}
        testID="sidebar-agent-list-scroll"
        keyExtractor={keyExtractor}
        renderItem={renderRow}
        onDragEnd={handleDragEnd}
        showsVerticalScrollIndicator={false}
        enableDesktopWebScrollbar={showDesktopWebScrollbar}
        ListFooterComponent={listFooterComponent}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        simultaneousGestureRef={parentGestureRef}
        onDragBegin={handleListDragBegin}
      />

      {isSelectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionBarCountText}>
            {selectedBatchKeys.size} selected
          </Text>
          <View style={styles.selectionBarActions}>
            <Pressable
              style={[
                styles.selectionBarButton,
                selectedBatchKeys.size === 0 && styles.selectionBarButtonDisabled,
              ]}
              disabled={selectedBatchKeys.size === 0}
              onPress={handleArchiveBatch}
            >
              <Archive
                size={theme.iconSize.md}
                color={theme.colors.accentForeground}
              />
            </Pressable>
            <Pressable
              style={styles.selectionBarButton}
              onPress={handleSelectionBack}
            >
              <X
                size={theme.iconSize.md}
                color={theme.colors.accentForeground}
                strokeWidth={2.5}
              />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  filterOptionsList: {
    gap: theme.spacing[1],
  },
  filterEmptyText: {
    color: theme.colors.foregroundMuted,
    textAlign: "center",
    paddingVertical: theme.spacing[4],
  },
  filterOption: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  filterOptionHovered: {
    backgroundColor: theme.colors.surface1,
  },
  filterOptionPressed: {
    backgroundColor: theme.colors.surface2,
  },
  filterOptionSelected: {
    backgroundColor: theme.colors.surface2,
  },
  filterOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  filterOptionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  filterOptionLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    flex: 1,
  },
  filterOptionCount: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  projectIcon: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    borderRadius: theme.borderRadius.sm,
  },
  projectIconFallback: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  projectIconFallbackInactive: {
    opacity: 0.5,
  },
  projectIconFallbackText: {
    color: theme.colors.foregroundMuted,
    fontSize: 9,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[4],
  },
  listContentSelectionMode: {
    paddingBottom: theme.spacing[16],
  },
  agentItem: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[1],
  },
  agentItemSelected: {
    backgroundColor: theme.colors.surface2,
  },
  agentItemHovered: {
    backgroundColor: theme.colors.surface1,
  },
  agentItemPressed: {
    backgroundColor: theme.colors.surface2,
  },
  agentRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 20,
  },
  selectionOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    backgroundColor: `${theme.colors.accent}1F`,
    alignItems: "center",
    justifyContent: "center",
  },
  agentTitle: {
    flex: 1,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foreground,
    opacity: 1,
  },
  agentTitleInactive: {
    opacity: 0.8,
  },
  agentTitleSelected: {
    opacity: 1,
  },
  relativeTimeText: {
    color: theme.colors.foregroundMuted,
    opacity: 0.78,
    fontSize: theme.fontSize.xs,
  },
  shortcutBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[1],
  },
  shortcutBadgeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  archiveButton: {
    minWidth: 24,
    height: 20,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[1],
  },
  agentMetaRow: {
    marginTop: theme.spacing[1],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  agentMetaProjectIcon: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    borderRadius: theme.borderRadius.sm,
  },
  agentMetaProjectIconInactive: {
    opacity: 0.5,
  },
  agentMetaProjectName: {
    color: theme.colors.foreground,
    opacity: 0.78,
    fontSize: theme.fontSize.xs,
    flexShrink: 0,
  },
  agentMetaBranchBadge: {
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[1],
    paddingVertical: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  agentMetaBranchBadgeSelected: {
    borderColor: theme.colors.borderAccent,
  },
  agentMetaBranchText: {
    color: theme.colors.foreground,
    opacity: 0.76,
    fontSize: theme.fontSize.xs,
    flexShrink: 1,
    minWidth: 0,
  },
  selectionBar: {
    position: "absolute",
    left: theme.spacing[2],
    right: theme.spacing[2],
    bottom: theme.spacing[2],
    borderRadius: theme.borderRadius["2xl"],
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectionBarCountText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  selectionBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  selectionBarButton: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.full,
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectionBarButtonDisabled: {
    opacity: 0.5,
  },
}));
