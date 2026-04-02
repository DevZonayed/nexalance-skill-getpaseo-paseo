import { useCallback, useState, type ComponentType } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Plus, SquarePen, SquareTerminal } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import invariant from "tiny-invariant";
import { usePaneContext } from "@/panels/pane-context";
import type { PanelRegistration } from "@/panels/panel-registry";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { generateDraftId } from "@/stores/draft-keys";
import { useSessionStore } from "@/stores/session-store";
import { toErrorMessage } from "@/utils/error-messages";
import { getWorkspaceExecutionAuthority } from "@/utils/workspace-execution";

function useLauncherPanelDescriptor() {
  return {
    label: "New Tab",
    subtitle: "New Tab",
    titleState: "ready" as const,
    icon: Plus,
    statusBucket: null,
  };
}

function LauncherPanel() {
  const { serverId, workspaceId, target, retargetCurrentTab, isPaneFocused } = usePaneContext();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const workspaces = useSessionStore((state) => state.sessions[serverId]?.workspaces);
  const workspaceAuthority = getWorkspaceExecutionAuthority({ workspaces, workspaceId });
  const workspaceDirectory = workspaceAuthority.ok
    ? workspaceAuthority.authority.workspaceDirectory
    : null;
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  invariant(target.kind === "launcher", "LauncherPanel requires launcher target");

  const openDraftTab = useCallback(() => {
    setErrorMessage(null);
    setPendingAction("draft");
    retargetCurrentTab({
      kind: "draft",
      draftId: generateDraftId(),
    });
    setPendingAction(null);
  }, [retargetCurrentTab]);

  const openTerminalTab = useCallback(async () => {
    if (!client || !isConnected || !workspaceDirectory) {
      setErrorMessage(!workspaceDirectory ? "Workspace directory not found" : "Host is not connected");
      return;
    }

    setPendingAction("terminal");
    setErrorMessage(null);

    try {
      const payload = await client.createTerminal(workspaceDirectory);
      if (payload.error || !payload.terminal) {
        throw new Error(payload.error ?? "Failed to open terminal");
      }
      retargetCurrentTab({
        kind: "terminal",
        terminalId: payload.terminal.id,
      });
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setPendingAction((current) => (current === "terminal" ? null : current));
    }
  }, [client, isConnected, retargetCurrentTab, workspaceDirectory]);

  const actionsDisabled = pendingAction !== null;

  if (!workspaceDirectory) {
    return (
      <View style={styles.container}>
        <View style={[styles.content, styles.loadingContent]}>
          <Text style={styles.errorText}>
            {workspaceAuthority.ok ? "Workspace execution directory not found." : workspaceAuthority.message}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          !isPaneFocused ? styles.contentUnfocused : null,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>
          <View style={styles.primaryRow}>
            <LauncherTile
              title="New Chat"
              Icon={SquarePen}
              accent
              disabled={actionsDisabled}
              pending={pendingAction === "draft"}
              onPress={openDraftTab}
            />
            <LauncherTile
              title="Terminal"
              Icon={SquareTerminal}
              disabled={actionsDisabled}
              pending={pendingAction === "terminal"}
              onPress={() => {
                void openTerminalTab();
              }}
            />
          </View>
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function LauncherTile({
  title,
  Icon,
  accent = false,
  disabled,
  pending,
  onPress,
}: {
  title: string;
  Icon: ComponentType<{ size: number; color: string }>;
  accent?: boolean;
  disabled: boolean;
  pending: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const iconColor = accent ? theme.colors.accentForeground : theme.colors.foreground;
  const titleColor = accent ? theme.colors.accentForeground : theme.colors.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.primaryTile,
        accent ? styles.primaryTileAccent : null,
        (hovered || pressed) && !disabled
          ? accent
            ? styles.primaryTileAccentInteractive
            : styles.tileInteractive
          : null,
        disabled ? styles.tileDisabled : null,
      ]}
    >
      <View style={[styles.primaryIconWrap, accent ? styles.primaryIconWrapAccent : null]}>
        {pending ? (
          <ActivityIndicator
            size="small"
            color={accent ? theme.colors.accentForeground : theme.colors.foreground}
          />
        ) : (
          <Icon size={16} color={iconColor} />
        )}
      </View>
      <Text style={[styles.primaryTileTitle, { color: titleColor }]}>{title}</Text>
    </Pressable>
  );
}

export const launcherPanelRegistration: PanelRegistration<"launcher"> = {
  kind: "launcher",
  component: LauncherPanel,
  useDescriptor: useLauncherPanelDescriptor,
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[8],
  },
  loadingContent: {
    flex: 1,
  },
  contentUnfocused: {
    opacity: 0.96,
  },
  inner: {
    width: "100%",
    maxWidth: 360,
    gap: theme.spacing[4],
  },
  primaryRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  tileInteractive: {
    backgroundColor: theme.colors.surface2,
  },
  tileDisabled: {
    opacity: theme.opacity[50],
  },
  primaryTile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface1,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  primaryTileAccent: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  primaryTileAccentInteractive: {
    backgroundColor: theme.colors.accentBright,
    borderColor: theme.colors.accentBright,
  },
  primaryIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
  },
  primaryIconWrapAccent: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  primaryTileTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.destructive,
  },
}));
