import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { Dimensions, Platform, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Check, ExternalLink, LoaderCircle, Minus, Play, X } from "lucide-react-native";
import { Pressable } from "react-native";
import { Portal } from "@gorhom/portal";
import { useBottomSheetModalInternal } from "@gorhom/bottom-sheet";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import type { PrHint } from "@/hooks/use-checkout-pr-status-query";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import { openExternalUrl } from "@/utils/open-external-url";
import { PrBadge } from "@/components/sidebar-workspace-list";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function measureElement(element: View): Promise<Rect> {
  return new Promise((resolve) => {
    element.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height });
    });
  });
}

function computeHoverCardPosition({
  triggerRect,
  contentSize,
  displayArea,
  offset,
}: {
  triggerRect: Rect;
  contentSize: { width: number; height: number };
  displayArea: Rect;
  offset: number;
}): { x: number; y: number } {
  let x = triggerRect.x + triggerRect.width + offset;
  let y = triggerRect.y;

  // If it overflows right, try left
  if (x + contentSize.width > displayArea.width - 8) {
    x = triggerRect.x - contentSize.width - offset;
  }

  // Constrain to screen
  const padding = 8;
  x = Math.max(padding, Math.min(displayArea.width - contentSize.width - padding, x));
  y = Math.max(
    displayArea.y + padding,
    Math.min(displayArea.y + displayArea.height - contentSize.height - padding, y),
  );

  return { x, y };
}

const HOVER_GRACE_MS = 100;
const HOVER_CARD_WIDTH = 260;

interface WorkspaceHoverCardProps {
  workspace: SidebarWorkspaceEntry;
  prHint: PrHint | null;
  isDragging: boolean;
}

export function WorkspaceHoverCard({
  workspace,
  prHint,
  isDragging,
  children,
}: PropsWithChildren<WorkspaceHoverCardProps>): ReactElement {
  // Desktop-only: skip on non-web platforms
  if (Platform.OS !== "web") {
    return <>{children}</>;
  }

  return (
    <WorkspaceHoverCardDesktop workspace={workspace} prHint={prHint} isDragging={isDragging}>
      {children}
    </WorkspaceHoverCardDesktop>
  );
}

function WorkspaceHoverCardDesktop({
  workspace,
  prHint,
  isDragging,
  children,
}: PropsWithChildren<WorkspaceHoverCardProps>): ReactElement {
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerHoveredRef = useRef(false);
  const contentHoveredRef = useRef(false);

  const hasServices = workspace.services.length > 0;
  const hasContent = hasServices || prHint !== null;

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearGraceTimer();
    graceTimerRef.current = setTimeout(() => {
      if (!triggerHoveredRef.current && !contentHoveredRef.current) {
        setOpen(false);
      }
      graceTimerRef.current = null;
    }, HOVER_GRACE_MS);
  }, [clearGraceTimer]);

  const handleTriggerEnter = useCallback(() => {
    triggerHoveredRef.current = true;
    clearGraceTimer();
    if (!isDragging && hasContent) {
      setOpen(true);
    }
  }, [clearGraceTimer, isDragging, hasContent]);

  const handleTriggerLeave = useCallback(() => {
    triggerHoveredRef.current = false;
    scheduleClose();
  }, [scheduleClose]);

  const handleContentEnter = useCallback(() => {
    contentHoveredRef.current = true;
    clearGraceTimer();
  }, [clearGraceTimer]);

  const handleContentLeave = useCallback(() => {
    contentHoveredRef.current = false;
    scheduleClose();
  }, [scheduleClose]);

  // Close when drag starts
  useEffect(() => {
    if (isDragging) {
      clearGraceTimer();
      setOpen(false);
    }
  }, [isDragging, clearGraceTimer]);

  // When content becomes available while trigger is already hovered, open the card.
  useEffect(() => {
    if (!hasContent || isDragging) return;
    if (triggerHoveredRef.current) {
      setOpen(true);
    }
  }, [hasContent, isDragging]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearGraceTimer();
    };
  }, [clearGraceTimer]);

  return (
    <View
      ref={triggerRef}
      collapsable={false}
      onPointerEnter={handleTriggerEnter}
      onPointerLeave={handleTriggerLeave}
    >
      {children}
      {open && hasContent ? (
        <WorkspaceHoverCardContent
          workspace={workspace}
          prHint={prHint}
          triggerRef={triggerRef}
          onContentEnter={handleContentEnter}
          onContentLeave={handleContentLeave}
        />
      ) : null}
    </View>
  );
}

function getServiceHealthColor(input: {
  health: SidebarWorkspaceEntry["services"][number]["health"];
  theme: ReturnType<typeof useUnistyles>["theme"];
}): string {
  if (input.health === "healthy") {
    return input.theme.colors.palette.green[500];
  }
  if (input.health === "unhealthy") {
    return input.theme.colors.palette.red[500];
  }
  return input.theme.colors.foregroundMuted;
}

function getServiceHealthLabel(
  health: SidebarWorkspaceEntry["services"][number]["health"],
): "Healthy" | "Unhealthy" | "Unknown" {
  if (health === "healthy") {
    return "Healthy";
  }
  if (health === "unhealthy") {
    return "Unhealthy";
  }
  return "Unknown";
}


function getCheckStatusColor(input: {
  status: string;
  theme: ReturnType<typeof useUnistyles>["theme"];
}): string {
  if (input.status === "success") return input.theme.colors.palette.green[500];
  if (input.status === "failure") return input.theme.colors.palette.red[500];
  if (input.status === "pending") return input.theme.colors.palette.amber[500];
  return input.theme.colors.foregroundMuted;
}

function getCheckStatusIcon(status: string): typeof Check {
  if (status === "success") return Check;
  if (status === "failure") return X;
  return Minus;
}

export function CheckStatusIndicator({
  status,
  size = 12,
}: {
  status: string;
  size?: number;
}): ReactElement | null {
  const { theme } = useUnistyles();

  if (!status || status === "none") return null;

  const color = getCheckStatusColor({ status, theme });
  const IconComponent = getCheckStatusIcon(status);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <IconComponent size={Math.round(size * 0.5)} color={color} strokeWidth={3} />
    </View>
  );
}

function ChecksSummary({ checks }: { checks: Array<{ status: string }> }): ReactElement {
  const { theme } = useUnistyles();
  const counts: Record<string, number> = {};
  for (const check of checks) {
    const bucket = check.status === "success" ? "success" : check.status === "failure" ? "failure" : "pending";
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }

  const buckets: Array<{ status: string; count: number }> = [];
  if (counts.failure) buckets.push({ status: "failure", count: counts.failure });
  if (counts.success) buckets.push({ status: "success", count: counts.success });
  if (counts.pending) buckets.push({ status: "pending", count: counts.pending });

  return (
    <>
      {buckets.map((bucket) => {
        const color = getCheckStatusColor({ status: bucket.status, theme });
        return (
          <View key={bucket.status} style={checksSummaryStyles.item}>
            <Text style={[checksSummaryStyles.count, { color }]}>{bucket.count}</Text>
            <CheckStatusIndicator status={bucket.status} size={12} />
          </View>
        );
      })}
    </>
  );
}

const checksSummaryStyles = StyleSheet.create((theme) => ({
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  count: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
}));

function WorkspaceHoverCardContent({
  workspace,
  prHint,
  triggerRef,
  onContentEnter,
  onContentLeave,
}: {
  workspace: SidebarWorkspaceEntry;
  prHint: PrHint | null;
  triggerRef: React.RefObject<View | null>;
  onContentEnter: () => void;
  onContentLeave: () => void;
}): ReactElement | null {
  const { theme } = useUnistyles();
  const toast = useToast();
  const client = useSessionStore((state) => state.sessions[workspace.serverId]?.client ?? null);
  const bottomSheetInternal = useBottomSheetModalInternal(true);
  const [triggerRect, setTriggerRect] = useState<Rect | null>(null);
  const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const startServiceMutation = useMutation({
    mutationFn: async (serviceName: string) => {
      if (!client) {
        throw new Error("Daemon client not available");
      }
      const result = await client.startWorkspaceService(workspace.workspaceId, serviceName);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onError: (error, serviceName) => {
      toast.show(
        error instanceof Error ? error.message : `Failed to start ${serviceName}`,
        { variant: "error" },
      );
    },
  });

  // Measure trigger — same pattern as tooltip.tsx
  useEffect(() => {
    if (!triggerRef.current) return;

    let cancelled = false;
    measureElement(triggerRef.current).then((rect) => {
      if (cancelled) return;
      setTriggerRect(rect);
    });

    return () => {
      cancelled = true;
    };
  }, [triggerRef]);

  // Compute position when both measurements are available
  useEffect(() => {
    if (!triggerRect || !contentSize) return;
    const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
    const displayArea = { x: 0, y: 0, width: screenWidth, height: screenHeight };
    const result = computeHoverCardPosition({
      triggerRect,
      contentSize,
      displayArea,
      offset: 4,
    });
    setPosition(result);
  }, [triggerRect, contentSize]);

  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = event.nativeEvent.layout;
      setContentSize({ width, height });
    },
    [],
  );

  return (
    <Portal hostName={bottomSheetInternal?.hostName}>
      <View pointerEvents="box-none" style={styles.portalOverlay}>
        <Animated.View
          entering={FadeIn.duration(80)}
          exiting={FadeOut.duration(80)}
          collapsable={false}
          onLayout={handleLayout}
          onPointerEnter={onContentEnter}
          onPointerLeave={onContentLeave}
          accessibilityRole="menu"
          accessibilityLabel="Workspace services"
          testID="workspace-hover-card"
          style={[
            styles.card,
            {
              width: HOVER_CARD_WIDTH,
              position: "absolute",
              top: position?.y ?? -9999,
              left: position?.x ?? -9999,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1} testID="hover-card-workspace-name">
              {workspace.name}
            </Text>
          </View>
          {prHint || workspace.diffStat ? (
            <View style={styles.cardMetaRow}>
              {workspace.diffStat ? (
                <View style={styles.diffStatRow}>
                  <Text style={styles.diffStatAdditions}>+{workspace.diffStat.additions}</Text>
                  <Text style={styles.diffStatDeletions}>-{workspace.diffStat.deletions}</Text>
                </View>
              ) : null}
              {prHint ? <PrBadge hint={prHint} /> : null}
            </View>
          ) : null}
          {workspace.services.length > 0 ? (
            <>
              <View style={styles.separator} />
              <Text style={styles.sectionLabel}>Services</Text>
              <View style={styles.sectionList} testID="hover-card-service-list">
                {workspace.services.map((service) => {
                  const isRunning = service.lifecycle === "running";
                  const isLinkable = isRunning && !!service.url;
                  return (
                    <Pressable
                      key={service.hostname}
                      accessibilityRole={isLinkable ? "link" : undefined}
                      accessibilityLabel={`${service.serviceName} service — ${isRunning ? getServiceHealthLabel(service.health) : "Stopped"}`}
                      testID={`hover-card-service-${service.serviceName}`}
                      style={({ hovered }) => [
                        styles.listRow,
                        hovered && isLinkable && styles.listRowHovered,
                      ]}
                      onPress={isLinkable ? () => void openExternalUrl(service.url!) : undefined}
                      disabled={!isLinkable}
                    >
                      {({ hovered }) => (
                        <>
                          <View
                            testID={`hover-card-service-health-${service.serviceName}`}
                            style={[
                              styles.statusDot,
                              {
                                backgroundColor: isRunning
                                  ? getServiceHealthColor({ health: service.health, theme })
                                  : theme.colors.foregroundMuted,
                              },
                            ]}
                          />
                          <Text
                            style={[
                              styles.listRowLabel,
                              {
                                color: isRunning
                                  ? theme.colors.foreground
                                  : theme.colors.foregroundMuted,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {service.serviceName}
                          </Text>
                          {isRunning && service.url ? (
                            <Text style={styles.listRowSecondary} numberOfLines={1}>
                              {service.url.replace(/^https?:\/\//, "")}
                            </Text>
                          ) : (
                            <View style={styles.listRowSpacer} />
                          )}
                          {isRunning ? (
                            service.url ? (
                              <ExternalLink
                                size={12}
                                color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted}
                              />
                            ) : null
                          ) : (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Start ${service.serviceName} service`}
                              testID={`hover-card-service-start-${service.serviceName}`}
                              hitSlop={4}
                              disabled={startServiceMutation.isPending}
                              onPress={(event) => {
                                event.stopPropagation();
                                startServiceMutation.mutate(service.serviceName);
                              }}
                            >
                              {({ hovered: actionHovered }) =>
                                startServiceMutation.isPending &&
                                startServiceMutation.variables === service.serviceName ? (
                                  <LoaderCircle size={12} color={theme.colors.foregroundMuted} />
                                ) : (
                                  <Play
                                    size={12}
                                    color={actionHovered ? theme.colors.foreground : theme.colors.foregroundMuted}
                                    fill="transparent"
                                  />
                                )
                              }
                            </Pressable>
                          )}
                        </>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
          {prHint?.checks && prHint.checks.length > 0 ? (
            <>
              <View style={styles.separator} />
              <Pressable
                style={({ hovered }) => [
                  styles.checksSummaryRow,
                  hovered && styles.listRowHovered,
                ]}
                onPress={() => void openExternalUrl(`${prHint.url}/checks`)}
              >
                {({ hovered }) => (
                  <>
                    <Text style={styles.checksSummaryLabel}>Checks</Text>
                    <View style={styles.checksSummaryCounts}>
                      <ChecksSummary checks={prHint.checks!} />
                    </View>
                    <ExternalLink
                      size={12}
                      color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted}
                    />
                  </>
                )}
              </Pressable>
            </>
          ) : null}
        </Animated.View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create((theme) => ({
  portalOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
  },
  card: {
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  cardTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    flex: 1,
    minWidth: 0,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  diffStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  sectionLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  sectionList: {
    paddingBottom: theme.spacing[1],
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 6,
    minHeight: 28,
  },
  listRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  listRowLabel: {
    fontSize: theme.fontSize.sm,
    flexShrink: 0,
  },
  listRowSecondary: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    flex: 1,
    minWidth: 0,
    textAlign: "right",
  },
  listRowSpacer: {
    flex: 1,
    minWidth: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  checksSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 6,
    minHeight: 28,
  },
  checksSummaryLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
  },
  checksSummaryCounts: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    justifyContent: "flex-end",
  },
}));
