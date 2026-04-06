import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import { Dimensions, Platform, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Check, ExternalLink, GitPullRequest, Minus, X } from "lucide-react-native";
import { Pressable } from "react-native";
import { Portal } from "@gorhom/portal";
import { useBottomSheetModalInternal } from "@gorhom/bottom-sheet";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import type { PrHint } from "@/hooks/use-checkout-pr-status-query";
import { openExternalUrl } from "@/utils/open-external-url";

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

const GITHUB_PR_STATE_LABELS: Record<PrHint["state"], string> = {
  open: "Open",
  merged: "Merged",
  closed: "Closed",
};


export function CheckStatusIndicator({
  status,
  size = 14,
}: {
  status: string;
  size?: number;
}): ReactElement | null {
  const { theme } = useUnistyles();
  const iconSize = Math.round(size * 0.6);

  if (!status || status === "none") return null;

  if (status === "pending") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: theme.colors.palette.amber[500],
          backgroundColor: "transparent",
        }}
      />
    );
  }

  if (status === "success") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "rgba(34,197,94,0.15)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Check size={iconSize} color={theme.colors.palette.green[500]} strokeWidth={3} />
      </View>
    );
  }

  if (status === "failure") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "rgba(239,68,68,0.15)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X size={iconSize} color={theme.colors.palette.red[500]} strokeWidth={3} />
      </View>
    );
  }

  // skipped / cancelled / unknown
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "rgba(128,128,128,0.15)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Minus size={iconSize} color={theme.colors.foregroundMuted} strokeWidth={3} />
    </View>
  );
}

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
  const bottomSheetInternal = useBottomSheetModalInternal(true);
  const [triggerRect, setTriggerRect] = useState<Rect | null>(null);
  const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

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
            <Pressable
              style={styles.cardMetaRow}
              onPress={prHint ? () => void openExternalUrl(prHint.url) : undefined}
              disabled={!prHint}
            >
              {prHint ? (
                <>
                  <GitPullRequest size={12} color={theme.colors.foregroundMuted} />
                  <Text style={styles.prBadgeText} numberOfLines={1}>
                    #{prHint.number} · {GITHUB_PR_STATE_LABELS[prHint.state]}
                  </Text>
                </>
              ) : null}

              {workspace.diffStat ? (
                <>
                  <Text style={styles.diffStatAdditions}>+{workspace.diffStat.additions}</Text>
                  <Text style={styles.diffStatDeletions}>-{workspace.diffStat.deletions}</Text>
                </>
              ) : null}
            </Pressable>
          ) : null}
          {prHint?.checks && prHint.checks.length > 0 ? (
            <>
            <View style={styles.separator} />
            <Text style={styles.sectionLabel}>Checks</Text>
            <View style={styles.checksList}>
              {prHint.checks.map((check) => (
                <Pressable
                  key={check.name}
                  style={({ hovered }) => [
                    styles.serviceRow,
                    hovered && check.url && styles.serviceRowHovered,
                  ]}
                  onPress={check.url ? () => void openExternalUrl(check.url!) : undefined}
                  disabled={!check.url}
                >
                  <CheckStatusIndicator status={check.status} size={14} />
                  <Text
                    style={styles.checkName}
                    numberOfLines={1}
                  >
                    {check.name}
                  </Text>
                  {check.url ? (
                    <ExternalLink size={11} color={theme.colors.foregroundMuted} />
                  ) : null}
                </Pressable>
              ))}
            </View>
            </>
          ) : null}
          {workspace.services.length > 0 ? (
            <>
              <View style={styles.separator} />
              <Text style={styles.sectionLabel}>Services</Text>
              <View style={styles.serviceList} testID="hover-card-service-list">
                {workspace.services.map((service) => (
                  <Pressable
                    key={service.hostname}
                    accessibilityRole="link"
                    accessibilityLabel={`${service.serviceName} service`}
                    testID={`hover-card-service-${service.serviceName}`}
                    style={({ hovered }) => [
                      styles.serviceRow,
                      hovered && styles.serviceRowHovered,
                    ]}
                    onPress={() => {
                      if (service.url) {
                        void openExternalUrl(service.url);
                      }
                    }}
                    disabled={!service.url}
                  >
                    <View
                      testID={`hover-card-service-status-${service.serviceName}`}
                      accessibilityLabel={service.status === "running" ? "Running" : "Stopped"}
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor:
                            service.status === "running"
                              ? theme.colors.palette.green[500]
                              : theme.colors.foregroundMuted,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.serviceName,
                        { color: service.status === "running" ? theme.colors.foreground : theme.colors.foregroundMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {service.serviceName}
                    </Text>
                    {service.url ? (
                      <Text style={styles.serviceUrl} numberOfLines={1}>
                        {service.url.replace(/^https?:\/\//, "")}
                      </Text>
                    ) : null}
                    {service.url ? (
                      <ExternalLink size={11} color={theme.colors.foregroundMuted} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
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
  prBadgeText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  serviceList: {
    paddingTop: theme.spacing[1],
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    minHeight: 32,
  },
  serviceRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  serviceName: {
    fontSize: theme.fontSize.sm,
    flexShrink: 0,
  },
  serviceUrl: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    flex: 1,
    minWidth: 0,
  },
  sectionLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  checksList: {
    paddingBottom: theme.spacing[1],
  },
  checkName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    flex: 1,
    minWidth: 0,
  },
}));
