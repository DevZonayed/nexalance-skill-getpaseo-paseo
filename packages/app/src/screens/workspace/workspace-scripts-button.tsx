import { type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, LoaderCircle, Play, Terminal } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { useSessionStore } from "@/stores/session-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/contexts/toast-context";
import { openExternalUrl } from "@/utils/open-external-url";

type Script = WorkspaceDescriptor["scripts"][number];

function getScriptHealthColor(
  health: Script["health"],
  theme: ReturnType<typeof useUnistyles>["theme"],
): string {
  if (health === "healthy") {
    return theme.colors.palette.green[500];
  }
  if (health === "unhealthy") {
    return theme.colors.palette.red[500];
  }
  return theme.colors.foregroundMuted;
}

interface WorkspaceScriptsButtonProps {
  serverId: string;
  workspaceId: string;
  scripts: WorkspaceDescriptor["scripts"];
}

export function WorkspaceScriptsButton({
  serverId,
  workspaceId,
  scripts,
}: WorkspaceScriptsButtonProps): ReactElement | null {
  const { theme } = useUnistyles();
  const toast = useToast();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);

  const startScriptMutation = useMutation({
    mutationFn: async (scriptName: string) => {
      if (!client) {
        throw new Error("Daemon client not available");
      }
      const result = await client.startWorkspaceScript(workspaceId, scriptName);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onError: (error, scriptName) => {
      toast.show(
        error instanceof Error ? error.message : `Failed to start ${scriptName}`,
        { variant: "error" },
      );
    },
  });

  if (scripts.length === 0) {
    return null;
  }

  const hasAnyRunning = scripts.some((s) => s.lifecycle === "running");

  return (
    <View style={styles.row}>
      <View style={styles.splitButton}>
        <DropdownMenu>
          <DropdownMenuTrigger
            testID="workspace-scripts-button"
            style={({ hovered, pressed, open }) => [
              styles.splitButtonPrimary,
              (hovered || pressed || open) && styles.splitButtonPrimaryHovered,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Workspace scripts"
          >
            <View style={styles.splitButtonContent}>
              <Terminal size={14} color={theme.colors.foregroundMuted} />
              <Text style={styles.splitButtonText}>Scripts</Text>
              {hasAnyRunning ? (
                <View
                  style={[
                    styles.runningDot,
                    { backgroundColor: theme.colors.palette.green[500] },
                  ]}
                />
              ) : null}
              <ChevronDown size={14} color={theme.colors.foregroundMuted} />
            </View>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            minWidth={200}
            maxWidth={280}
            testID="workspace-scripts-menu"
          >
            <View style={styles.scriptList}>
              {scripts.map((script) => {
                const isRunning = script.lifecycle === "running";
                const isLinkable = isRunning && !!script.url;

                return (
                  <Pressable
                    key={script.scriptName}
                    testID={`workspace-scripts-item-${script.scriptName}`}
                    accessibilityRole={isLinkable ? "link" : undefined}
                    accessibilityLabel={`${script.scriptName} script`}
                    style={({ hovered }) => [
                      styles.scriptRow,
                      hovered && isLinkable && styles.scriptRowHovered,
                    ]}
                    onPress={isLinkable ? () => void openExternalUrl(script.url!) : undefined}
                    disabled={!isLinkable}
                  >
                    {({ hovered }) => (
                      <>
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor: isRunning
                                ? getScriptHealthColor(script.health, theme)
                                : theme.colors.foregroundMuted,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.scriptName,
                            {
                              color: isRunning
                                ? theme.colors.foreground
                                : theme.colors.foregroundMuted,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {script.scriptName}
                        </Text>
                        {isRunning && script.url ? (
                          <Text style={styles.scriptUrl} numberOfLines={1}>
                            {script.url.replace(/^https?:\/\//, "")}
                          </Text>
                        ) : (
                          <View style={styles.spacer} />
                        )}
                        {isRunning ? (
                          script.url && hovered ? (
                            <View
                              style={[
                                styles.externalLinkOverlay,
                                {
                                  backgroundImage: `linear-gradient(to right, transparent, ${theme.colors.surface2} 40%)`,
                                },
                              ]}
                            >
                              <ExternalLink size={12} color={theme.colors.foreground} />
                            </View>
                          ) : null
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Run ${script.scriptName} script`}
                            testID={`workspace-scripts-start-${script.scriptName}`}
                            hitSlop={4}
                            disabled={startScriptMutation.isPending}
                            onPress={(event) => {
                              event.stopPropagation();
                              startScriptMutation.mutate(script.scriptName);
                            }}
                            style={styles.startButton}
                          >
                            {({ hovered: actionHovered }) =>
                              startScriptMutation.isPending &&
                              startScriptMutation.variables === script.scriptName ? (
                                <LoaderCircle size={12} color={theme.colors.foregroundMuted} />
                              ) : (
                                <>
                                  <Play
                                    size={10}
                                    color={
                                      actionHovered
                                        ? theme.colors.foreground
                                        : theme.colors.foregroundMuted
                                    }
                                    fill="transparent"
                                  />
                                  <Text
                                    style={[
                                      styles.startButtonLabel,
                                      {
                                        color: actionHovered
                                          ? theme.colors.foreground
                                          : theme.colors.foregroundMuted,
                                      },
                                    ]}
                                  >
                                    Run
                                  </Text>
                                </>
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
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  splitButton: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    overflow: "hidden",
  },
  splitButtonPrimary: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    justifyContent: "center",
  },
  splitButtonPrimaryHovered: {
    backgroundColor: theme.colors.surface2,
  },
  splitButtonText: {
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.5,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.normal,
  },
  splitButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1.5],
  },
  runningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  scriptList: {
    paddingVertical: theme.spacing[1],
  },
  scriptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 6,
    minHeight: 28,
  },
  scriptRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 2,
    flexShrink: 0,
  },
  scriptName: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 18,
    flexShrink: 0,
  },
  scriptUrl: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
    flex: 1,
    minWidth: 0,
    textAlign: "right",
  },
  spacer: {
    flex: 1,
    minWidth: 0,
  },
  externalLinkOverlay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    paddingLeft: theme.spacing[4],
    paddingRight: theme.spacing[3],
    alignItems: "center",
    justifyContent: "center",
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  startButtonLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
}));
