import {
  View,
  Text,
  Pressable,
  Modal,
  RefreshControl,
  FlatList,
  type ListRenderItem,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallback, useMemo, useState, type ReactElement } from "react";
import { router, usePathname, type Href } from "expo-router";
import { StyleSheet, UnistylesRuntime, useUnistyles } from "react-native-unistyles";
import { formatTimeAgo } from "@/utils/time";
import { shortenPath } from "@/utils/shorten-path";
import { type AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { useSessionStore } from "@/stores/session-store";
import { AgentStatusDot } from "@/components/agent-status-dot";
import {
  buildAgentNavigationKey,
  startNavigationTiming,
} from "@/utils/navigation-timing";
import { buildHostWorkspaceAgentRoute } from "@/utils/host-routes";

interface AgentListProps {
  agents: AggregatedAgent[];
  showCheckoutInfo?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  selectedAgentId?: string;
  onAgentSelect?: () => void;
  listFooterComponent?: ReactElement | null;
}

interface AgentListSection {
  key: string;
  title: string;
  data: AggregatedAgent[];
}

type SessionColumnKey = "session" | "project" | "host" | "status" | "updated";

interface SessionColumnDefinition {
  key: SessionColumnKey;
  label: string;
  flex: number;
  align?: "left" | "right";
  mobile?: boolean;
  requiresMultiHost?: boolean;
}

const SESSION_COLUMNS: SessionColumnDefinition[] = [
  { key: "session", label: "Session", flex: 2.3, mobile: true },
  { key: "project", label: "Project", flex: 2.6 },
  { key: "host", label: "Host", flex: 1.2, requiresMultiHost: true },
  { key: "status", label: "Status", flex: 1.2, mobile: true },
  { key: "updated", label: "Updated", flex: 1, align: "right", mobile: true },
];

function deriveDateSectionLabel(lastActivityAt: Date): string {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const activityStart = new Date(
    lastActivityAt.getFullYear(),
    lastActivityAt.getMonth(),
    lastActivityAt.getDate()
  );

  if (activityStart.getTime() >= todayStart.getTime()) {
    return "Today";
  }
  if (activityStart.getTime() >= yesterdayStart.getTime()) {
    return "Yesterday";
  }

  const diffTime = todayStart.getTime() - activityStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) {
    return "This week";
  }
  if (diffDays <= 30) {
    return "This month";
  }
  return "Older";
}

function formatStatusLabel(status: AggregatedAgent["status"]): string {
  switch (status) {
    case "initializing":
      return "Starting";
    case "idle":
      return "Idle";
    case "running":
      return "Running";
    case "error":
      return "Error";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}

function getVisibleColumns(input: {
  isMobile: boolean;
  showHostColumn: boolean;
}): SessionColumnDefinition[] {
  return SESSION_COLUMNS.filter((column) => {
    if (!input.showHostColumn && column.requiresMultiHost) {
      return false;
    }
    if (input.isMobile && !column.mobile) {
      return false;
    }
    return true;
  });
}

function SessionCell({
  align = "left",
  flex,
  children,
}: {
  align?: "left" | "right";
  flex: number;
  children: ReactElement;
}) {
  return (
    <View
      style={[
        styles.cell,
        { flex },
        align === "right" ? styles.cellRight : styles.cellLeft,
      ]}
    >
      {children}
    </View>
  );
}

function SessionBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === "warning" && styles.badgeWarning,
        tone === "danger" && styles.badgeDanger,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === "warning" && styles.badgeTextWarning,
          tone === "danger" && styles.badgeTextDanger,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function SessionTableRow({
  agent,
  columns,
  isMobile,
  selectedAgentId,
  onPress,
  onLongPress,
}: {
  agent: AggregatedAgent;
  columns: SessionColumnDefinition[];
  isMobile: boolean;
  selectedAgentId?: string;
  onPress: (agent: AggregatedAgent) => void;
  onLongPress: (agent: AggregatedAgent) => void;
}) {
  const timeAgo = formatTimeAgo(agent.lastActivityAt);
  const agentKey = `${agent.serverId}:${agent.id}`;
  const isSelected = selectedAgentId === agentKey;
  const statusLabel = formatStatusLabel(agent.status);
  const projectPath = shortenPath(agent.cwd);

  return (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.row,
        isSelected && styles.rowSelected,
        hovered && styles.rowHovered,
        pressed && styles.rowPressed,
      ]}
      onPress={() => onPress(agent)}
      onLongPress={() => onLongPress(agent)}
      testID={`agent-row-${agent.serverId}-${agent.id}`}
    >
      {({ hovered }) => (
        <View style={styles.rowInner}>
          {columns.map((column) => {
            if (column.key === "session") {
              return (
                <SessionCell key={column.key} flex={column.flex} align={column.align}>
                  <View style={styles.primaryCell}>
                    <View style={styles.sessionTitleRow}>
                      <Text
                        style={[
                          styles.sessionTitle,
                          (isSelected || hovered) && styles.sessionTitleHighlighted,
                        ]}
                        numberOfLines={1}
                      >
                        {agent.title || "New session"}
                      </Text>
                      {agent.archivedAt ? <SessionBadge label="Archived" /> : null}
                      {(agent.pendingPermissionCount ?? 0) > 0 ? (
                        <SessionBadge
                          label={`${agent.pendingPermissionCount} pending`}
                          tone="warning"
                        />
                      ) : null}
                    </View>
                    {isMobile ? (
                      <View style={styles.sessionMetaRow}>
                        <Text style={styles.sessionMetaText} numberOfLines={1}>
                          {projectPath}
                        </Text>
                        <Text style={styles.sessionMetaSeparator}>·</Text>
                        <Text style={styles.sessionMetaText}>{statusLabel}</Text>
                        {agent.serverLabel ? (
                          <>
                            <Text style={styles.sessionMetaSeparator}>·</Text>
                            <Text style={styles.sessionMetaText} numberOfLines={1}>
                              {agent.serverLabel}
                            </Text>
                          </>
                        ) : null}
                      </View>
                    ) : (
                      <View style={styles.secondaryBadgeRow}>
                        {agent.requiresAttention ? (
                          <SessionBadge label="Attention" tone="danger" />
                        ) : null}
                      </View>
                    )}
                  </View>
                </SessionCell>
              );
            }

            if (column.key === "project") {
              return (
                <SessionCell key={column.key} flex={column.flex} align={column.align}>
                  <View style={styles.projectCell}>
                    <Text style={styles.projectPath} numberOfLines={1}>
                      {projectPath}
                    </Text>
                    <Text style={styles.projectProvider} numberOfLines={1}>
                      {agent.provider}
                    </Text>
                  </View>
                </SessionCell>
              );
            }

            if (column.key === "host") {
              return (
                <SessionCell key={column.key} flex={column.flex} align={column.align}>
                  <Text style={styles.hostText} numberOfLines={1}>
                    {agent.serverLabel}
                  </Text>
                </SessionCell>
              );
            }

            if (column.key === "status") {
              return (
                <SessionCell key={column.key} flex={column.flex} align={column.align}>
                  <View style={styles.statusCell}>
                    <AgentStatusDot
                      status={agent.status}
                      requiresAttention={agent.requiresAttention}
                    />
                    <Text style={styles.statusText} numberOfLines={1}>
                      {statusLabel}
                    </Text>
                  </View>
                </SessionCell>
              );
            }

            return (
              <SessionCell key={column.key} flex={column.flex} align={column.align}>
                <Text style={styles.updatedText} numberOfLines={1}>
                  {timeAgo}
                </Text>
              </SessionCell>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

function SessionTableSection({
  section,
  columns,
  isMobile,
  selectedAgentId,
  onAgentPress,
  onAgentLongPress,
}: {
  section: AgentListSection;
  columns: SessionColumnDefinition[];
  isMobile: boolean;
  selectedAgentId?: string;
  onAgentPress: (agent: AggregatedAgent) => void;
  onAgentLongPress: (agent: AggregatedAgent) => void;
}) {
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <View style={styles.sectionLine} />
      </View>

      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          {columns.map((column) => (
            <SessionCell key={column.key} flex={column.flex} align={column.align}>
              <Text
                style={[
                  styles.columnLabel,
                  column.align === "right" && styles.columnLabelRight,
                ]}
                numberOfLines={1}
              >
                {column.label}
              </Text>
            </SessionCell>
          ))}
        </View>

        {section.data.map((agent, index) => (
          <View
            key={`${agent.serverId}:${agent.id}`}
            style={index > 0 ? styles.rowDivider : undefined}
          >
            <SessionTableRow
              agent={agent}
              columns={columns}
              isMobile={isMobile}
              selectedAgentId={selectedAgentId}
              onPress={onAgentPress}
              onLongPress={onAgentLongPress}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

export function AgentList({
  agents,
  isRefreshing = false,
  onRefresh,
  selectedAgentId,
  onAgentSelect,
  listFooterComponent,
}: AgentListProps) {
  const { theme } = useUnistyles();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [actionAgent, setActionAgent] = useState<AggregatedAgent | null>(null);
  const isMobile =
    UnistylesRuntime.breakpoint === "xs" || UnistylesRuntime.breakpoint === "sm";

  const actionClient = useSessionStore((state) =>
    actionAgent?.serverId ? state.sessions[actionAgent.serverId]?.client ?? null : null
  );

  const isActionSheetVisible = actionAgent !== null;
  const isActionDaemonUnavailable = Boolean(actionAgent?.serverId && !actionClient);
  const showHostColumn = useMemo(
    () => new Set(agents.map((agent) => agent.serverId)).size > 1,
    [agents]
  );
  const columns = useMemo(
    () => getVisibleColumns({ isMobile, showHostColumn }),
    [isMobile, showHostColumn]
  );

  const handleAgentPress = useCallback(
    (agent: AggregatedAgent) => {
      if (isActionSheetVisible) {
        return;
      }

      const serverId = agent.serverId;
      const agentId = agent.id;
      const navigationKey = buildAgentNavigationKey(serverId, agentId);
      startNavigationTiming(navigationKey, {
        from: "home",
        to: "agent",
        params: { serverId, agentId },
      });

      const shouldReplace = pathname.startsWith("/h/");
      const navigate = shouldReplace ? router.replace : router.push;

      onAgentSelect?.();

      const route: Href = buildHostWorkspaceAgentRoute(
        serverId,
        agent.cwd,
        agentId
      ) as Href;
      navigate(route);
    },
    [isActionSheetVisible, pathname, onAgentSelect]
  );

  const handleAgentLongPress = useCallback((agent: AggregatedAgent) => {
    setActionAgent(agent);
  }, []);

  const handleCloseActionSheet = useCallback(() => {
    setActionAgent(null);
  }, []);

  const handleArchiveAgent = useCallback(() => {
    if (!actionAgent || !actionClient) {
      return;
    }
    void actionClient.archiveAgent(actionAgent.id);
    setActionAgent(null);
  }, [actionAgent, actionClient]);

  const sections = useMemo((): AgentListSection[] => {
    const order = ["Today", "Yesterday", "This week", "This month", "Older"] as const;
    const buckets = new Map<string, AggregatedAgent[]>();
    for (const agent of agents) {
      const label = deriveDateSectionLabel(agent.lastActivityAt);
      const existing = buckets.get(label) ?? [];
      existing.push(agent);
      buckets.set(label, existing);
    }

    const result: AgentListSection[] = [];
    for (const label of order) {
      const data = buckets.get(label);
      if (!data || data.length === 0) {
        continue;
      }
      result.push({ key: `date:${label}`, title: label, data });
    }
    return result;
  }, [agents]);

  const renderSection: ListRenderItem<AgentListSection> = useCallback(
    ({ item: section }) => (
      <SessionTableSection
        section={section}
        columns={columns}
        isMobile={isMobile}
        selectedAgentId={selectedAgentId}
        onAgentPress={handleAgentPress}
        onAgentLongPress={handleAgentLongPress}
      />
    ),
    [columns, handleAgentLongPress, handleAgentPress, isMobile, selectedAgentId]
  );

  const keyExtractor = useCallback((section: AgentListSection) => section.key, []);

  return (
    <>
      <FlatList
        data={sections}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyExtractor={keyExtractor}
        renderItem={renderSection}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={listFooterComponent}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.foregroundMuted}
              colors={[theme.colors.foregroundMuted]}
            />
          ) : undefined
        }
      />

      <Modal
        visible={isActionSheetVisible}
        animationType="fade"
        transparent
        onRequestClose={handleCloseActionSheet}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={handleCloseActionSheet}
          />
          <View
            style={[
              styles.sheetContainer,
              { paddingBottom: Math.max(insets.bottom, theme.spacing[6]) },
            ]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {isActionDaemonUnavailable ? "Host offline" : "Archive this session?"}
            </Text>
            <View style={styles.sheetButtonRow}>
              <Pressable
                style={[styles.sheetButton, styles.sheetCancelButton]}
                onPress={handleCloseActionSheet}
                testID="agent-action-cancel"
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={isActionDaemonUnavailable}
                style={[styles.sheetButton, styles.sheetArchiveButton]}
                onPress={handleArchiveAgent}
                testID="agent-action-archive"
              >
                <Text
                  style={[
                    styles.sheetArchiveText,
                    isActionDaemonUnavailable && styles.sheetArchiveTextDisabled,
                  ]}
                >
                  Archive
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[6],
    },
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[6],
    gap: theme.spacing[1],
  },
  sectionBlock: {
    marginTop: theme.spacing[2],
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[1],
    marginBottom: theme.spacing[2],
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.foregroundMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.surface2,
  },
  tableCard: {
    overflow: "hidden",
    borderRadius: theme.borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.surface2,
    backgroundColor: theme.colors.surface1,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.surface2,
  },
  columnLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: theme.colors.foregroundMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  columnLabelRight: {
    textAlign: "right",
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.surface2,
  },
  row: {
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
    paddingVertical: {
      xs: theme.spacing[2],
      md: theme.spacing[3],
    },
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  rowSelected: {
    backgroundColor: theme.colors.surface2,
  },
  rowHovered: {
    backgroundColor: theme.colors.surface0,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  cell: {
    minWidth: 0,
  },
  cellLeft: {
    alignItems: "flex-start",
  },
  cellRight: {
    alignItems: "flex-end",
  },
  primaryCell: {
    width: "100%",
    gap: theme.spacing[1],
  },
  sessionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  sessionTitle: {
    flexShrink: 1,
    fontSize: theme.fontSize.base,
    fontWeight: "500",
    color: theme.colors.foreground,
    opacity: 0.86,
  },
  sessionTitleHighlighted: {
    opacity: 1,
  },
  sessionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  sessionMetaText: {
    maxWidth: "100%",
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  sessionMetaSeparator: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    opacity: 0.7,
  },
  secondaryBadgeRow: {
    minHeight: theme.spacing[6],
    justifyContent: "center",
  },
  projectCell: {
    width: "100%",
    gap: theme.spacing[1],
  },
  projectPath: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  projectProvider: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  hostText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  statusCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  statusText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  updatedText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    textAlign: "right",
  },
  badge: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
  badgeWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  badgeDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.14)",
  },
  badgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: theme.colors.foregroundMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  badgeTextWarning: {
    color: theme.colors.palette.amber[500],
  },
  badgeTextDanger: {
    color: theme.colors.palette.red[300],
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheetContainer: {
    backgroundColor: theme.colors.surface2,
    borderTopLeftRadius: theme.borderRadius["2xl"],
    borderTopRightRadius: theme.borderRadius["2xl"],
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[4],
    gap: theme.spacing[4],
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foregroundMuted,
    opacity: 0.3,
  },
  sheetTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
    textAlign: "center",
  },
  sheetButtonRow: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  sheetButton: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[4],
    alignItems: "center",
    justifyContent: "center",
  },
  sheetArchiveButton: {
    backgroundColor: theme.colors.primary,
  },
  sheetArchiveText: {
    color: theme.colors.primaryForeground,
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.base,
  },
  sheetArchiveTextDisabled: {
    opacity: 0.5,
  },
  sheetCancelButton: {
    backgroundColor: theme.colors.surface1,
  },
  sheetCancelText: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.base,
  },
}));
