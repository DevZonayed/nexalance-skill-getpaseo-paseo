import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ChevronLeft, MessagesSquare, SquareTerminal } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { createNameId } from "mnemonic-id";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Composer } from "@/components/composer";
import { useToast } from "@/contexts/toast-context";
import { useAgentInputDraft } from "@/hooks/use-agent-input-draft";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { normalizeWorkspaceDescriptor, useSessionStore } from "@/stores/session-store";
import { useWorkspaceSetupStore } from "@/stores/workspace-setup-store";
import { normalizeAgentSnapshot } from "@/utils/agent-snapshots";
import { encodeImages } from "@/utils/encode-images";
import { toErrorMessage } from "@/utils/error-messages";
import {
  requireWorkspaceExecutionAuthority,
  requireWorkspaceRecordId,
} from "@/utils/workspace-execution";
import { navigateToPreparedWorkspaceTab } from "@/utils/workspace-navigation";
import type { MessagePayload } from "./message-input";

export function WorkspaceSetupDialog() {
  const { theme } = useUnistyles();
  const toast = useToast();
  const pendingWorkspaceSetup = useWorkspaceSetupStore((state) => state.pendingWorkspaceSetup);
  const clearWorkspaceSetup = useWorkspaceSetupStore((state) => state.clearWorkspaceSetup);
  const mergeWorkspaces = useSessionStore((state) => state.mergeWorkspaces);
  const setHasHydratedWorkspaces = useSessionStore((state) => state.setHasHydratedWorkspaces);
  const setAgents = useSessionStore((state) => state.setAgents);
  const [step, setStep] = useState<"choose" | "chat">("choose");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdWorkspace, setCreatedWorkspace] = useState<ReturnType<
    typeof normalizeWorkspaceDescriptor
  > | null>(null);
  const [pendingAction, setPendingAction] = useState<"chat" | "terminal" | null>(null);

  const serverId = pendingWorkspaceSetup?.serverId ?? "";
  const sourceDirectory = pendingWorkspaceSetup?.sourceDirectory ?? "";
  const displayName = pendingWorkspaceSetup?.displayName?.trim() ?? "";
  const workspace = createdWorkspace;
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const chatDraft = useAgentInputDraft({
    draftKey: `workspace-setup:${serverId}:${sourceDirectory}`,
    composer: {
      initialServerId: serverId || null,
      initialValues: workspace?.workspaceDirectory
        ? { workingDir: workspace.workspaceDirectory }
        : undefined,
      isVisible: pendingWorkspaceSetup !== null,
      onlineServerIds: isConnected && serverId ? [serverId] : [],
      lockedWorkingDir: workspace?.workspaceDirectory || undefined,
    },
  });
  const composerState = chatDraft.composerState;
  if (!composerState && pendingWorkspaceSetup) {
    throw new Error("Workspace setup composer state is required");
  }

  useEffect(() => {
    setStep("choose");
    setErrorMessage(null);
    setCreatedWorkspace(null);
    setPendingAction(null);
  }, [pendingWorkspaceSetup?.creationMethod, serverId, sourceDirectory]);

  const handleClose = useCallback(() => {
    clearWorkspaceSetup();
  }, [clearWorkspaceSetup]);

  const navigateAfterCreation = useCallback(
    (
      workspaceId: string,
      target: { kind: "agent"; agentId: string } | { kind: "terminal"; terminalId: string },
    ) => {
      if (!pendingWorkspaceSetup) {
        return;
      }

      clearWorkspaceSetup();
      navigateToPreparedWorkspaceTab({
        serverId: pendingWorkspaceSetup.serverId,
        workspaceId,
        target,
        navigationMethod: pendingWorkspaceSetup.navigationMethod,
      });
    },
    [clearWorkspaceSetup, pendingWorkspaceSetup],
  );

  const withConnectedClient = useCallback(() => {
    if (!client || !isConnected) {
      throw new Error("Host is not connected");
    }
    return client;
  }, [client, isConnected]);

  const ensureWorkspace = useCallback(async () => {
    if (!pendingWorkspaceSetup) {
      throw new Error("No workspace setup is pending");
    }

    if (createdWorkspace) {
      return createdWorkspace;
    }

    const connectedClient = withConnectedClient();
    const payload =
      pendingWorkspaceSetup.creationMethod === "create_worktree"
        ? await connectedClient.createPaseoWorktree({
            cwd: pendingWorkspaceSetup.sourceDirectory,
            worktreeSlug: createNameId(),
          })
        : await connectedClient.openProject(pendingWorkspaceSetup.sourceDirectory);

    if (payload.error || !payload.workspace) {
      throw new Error(
        payload.error ??
          (pendingWorkspaceSetup.creationMethod === "create_worktree"
            ? "Failed to create worktree"
            : "Failed to open project"),
      );
    }

    const normalizedWorkspace = normalizeWorkspaceDescriptor(payload.workspace);
    mergeWorkspaces(pendingWorkspaceSetup.serverId, [normalizedWorkspace]);
    if (pendingWorkspaceSetup.creationMethod === "open_project") {
      setHasHydratedWorkspaces(pendingWorkspaceSetup.serverId, true);
    }
    setCreatedWorkspace(normalizedWorkspace);
    return normalizedWorkspace;
  }, [
    createdWorkspace,
    mergeWorkspaces,
    pendingWorkspaceSetup,
    setHasHydratedWorkspaces,
    withConnectedClient,
  ]);

  const getIsStillActive = useCallback(() => {
    const current = useWorkspaceSetupStore.getState().pendingWorkspaceSetup;
    return (
      current?.serverId === pendingWorkspaceSetup?.serverId &&
      current?.sourceDirectory === pendingWorkspaceSetup?.sourceDirectory &&
      current?.creationMethod === pendingWorkspaceSetup?.creationMethod
    );
  }, [
    pendingWorkspaceSetup?.creationMethod,
    pendingWorkspaceSetup?.serverId,
    pendingWorkspaceSetup?.sourceDirectory,
  ]);

  const handleCreateChatAgent = useCallback(
    async ({ text, images }: MessagePayload) => {
      try {
        setPendingAction("chat");
        setErrorMessage(null);
        const workspace = await ensureWorkspace();
        const connectedClient = withConnectedClient();
        if (!composerState) {
          throw new Error("Workspace setup composer state is required");
        }

        const encodedImages = await encodeImages(images);
        const workspaceDirectory = requireWorkspaceExecutionAuthority({ workspace }).workspaceDirectory;
        const agent = await connectedClient.createAgent({
          provider: composerState.selectedProvider,
          cwd: workspaceDirectory,
          workspaceId: requireWorkspaceRecordId(workspace.id),
          ...(composerState.modeOptions.length > 0 && composerState.selectedMode !== ""
            ? { modeId: composerState.selectedMode }
            : {}),
          ...(composerState.effectiveModelId ? { model: composerState.effectiveModelId } : {}),
          ...(composerState.effectiveThinkingOptionId
            ? { thinkingOptionId: composerState.effectiveThinkingOptionId }
            : {}),
          ...(text.trim() ? { initialPrompt: text.trim() } : {}),
          ...(encodedImages && encodedImages.length > 0 ? { images: encodedImages } : {}),
        });

        if (!getIsStillActive()) {
          return;
        }

        setAgents(serverId, (previous) => {
          const next = new Map(previous);
          next.set(agent.id, normalizeAgentSnapshot(agent, serverId));
          return next;
        });
        navigateAfterCreation(workspace.id, { kind: "agent", agentId: agent.id });
      } catch (error) {
        const message = toErrorMessage(error);
        setErrorMessage(message);
        toast.error(message);
      } finally {
        if (getIsStillActive()) {
          setPendingAction(null);
        }
      }
    },
    [
      composerState,
      getIsStillActive,
      navigateAfterCreation,
      serverId,
      setAgents,
      ensureWorkspace,
      toast,
      withConnectedClient,
    ],
  );

  const handleCreateTerminal = useCallback(async () => {
    try {
      setPendingAction("terminal");
      setErrorMessage(null);
      const workspace = await ensureWorkspace();
      const connectedClient = withConnectedClient();
      const workspaceDirectory = requireWorkspaceExecutionAuthority({ workspace }).workspaceDirectory;

      const payload = await connectedClient.createTerminal(workspaceDirectory);
      if (payload.error || !payload.terminal) {
        throw new Error(payload.error ?? "Failed to open terminal");
      }

      if (!getIsStillActive()) {
        return;
      }

      navigateAfterCreation(workspace.id, { kind: "terminal", terminalId: payload.terminal.id });
    } catch (error) {
      const message = toErrorMessage(error);
      setErrorMessage(message);
      toast.error(message);
    } finally {
      if (getIsStillActive()) {
        setPendingAction(null);
      }
    }
  }, [ensureWorkspace, getIsStillActive, navigateAfterCreation, toast, withConnectedClient]);

  const workspaceTitle =
    workspace?.name ||
    workspace?.projectDisplayName ||
    displayName ||
    sourceDirectory.split(/[\\/]/).filter(Boolean).pop() ||
    sourceDirectory;
  const workspacePath = workspace?.workspaceDirectory || "Workspace will be created before launch.";

  if (!pendingWorkspaceSetup || !sourceDirectory) {
    return null;
  }

  return (
    <AdaptiveModalSheet
      title="Set up workspace"
      visible={true}
      onClose={handleClose}
      snapPoints={["82%", "94%"]}
      testID="workspace-setup-dialog"
    >
      <View style={styles.header}>
        <Text style={styles.workspaceTitle}>{workspaceTitle}</Text>
        <Text style={styles.workspacePath}>{workspacePath}</Text>
      </View>

      {step === "choose" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What do you want to open?</Text>
          <View style={styles.choiceGrid}>
            <ChoiceCard
              title="Chat Agent"
              description="Open this workspace with a prompt-first chat agent."
              Icon={MessagesSquare}
              disabled={pendingAction !== null}
              onPress={() => {
                setErrorMessage(null);
                setStep("chat");
              }}
            />
            <ChoiceCard
              title="Terminal"
              description="Create the workspace, then open a standalone terminal tab."
              Icon={SquareTerminal}
              disabled={pendingAction !== null}
              pending={pendingAction === "terminal"}
              onPress={() => {
                void handleCreateTerminal();
              }}
            />
          </View>
        </View>
      ) : null}

      {step === "chat" ? (
        <View style={styles.section}>
          <StepHeader
            title="Chat Agent"
            onBack={() => {
              setErrorMessage(null);
              setStep("choose");
            }}
          />
          <Text style={styles.helper}>
            Start with a prompt and optional images. The workspace is created first, then the agent launches, then navigation happens.
          </Text>
          <View style={styles.composerCard}>
            <Composer
              agentId={`workspace-setup:${serverId}:${sourceDirectory}`}
              serverId={serverId}
              isInputActive={true}
              onSubmitMessage={handleCreateChatAgent}
              isSubmitLoading={pendingAction === "chat"}
              blurOnSubmit={true}
              value={chatDraft.text}
              onChangeText={chatDraft.setText}
              images={chatDraft.images}
              onChangeImages={chatDraft.setImages}
              clearDraft={chatDraft.clear}
              autoFocus
              commandDraftConfig={composerState?.commandDraftConfig}
              statusControls={
                composerState
                  ? {
                      ...composerState.statusControls,
                      disabled: pendingAction !== null,
                    }
                  : undefined
              }
            />
          </View>
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
    </AdaptiveModalSheet>
  );
}

function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.stepHeader}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <ChevronLeft size={16} color={theme.colors.foregroundMuted} />
      </Pressable>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function ChoiceCard({
  title,
  description,
  Icon,
  disabled,
  pending = false,
  onPress,
}: {
  title: string;
  description: string;
  Icon: ComponentType<{ size: number; color: string }>;
  disabled: boolean;
  pending?: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.choiceCard,
        (hovered || pressed) && !disabled ? styles.choiceCardHovered : null,
        disabled ? styles.cardDisabled : null,
      ]}
    >
      <View style={styles.choiceIconWrap}>
        {pending ? (
          <ActivityIndicator size="small" color={theme.colors.foreground} />
        ) : (
          <Icon size={16} color={theme.colors.foreground} />
        )}
      </View>
      <View style={styles.choiceBody}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.choiceDescription}>{description}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    gap: theme.spacing[1],
  },
  workspaceTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  workspacePath: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  section: {
    gap: theme.spacing[3],
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
  },
  helper: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    lineHeight: 20,
  },
  choiceGrid: {
    gap: theme.spacing[2],
  },
  choiceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
  choiceCardHovered: {
    backgroundColor: theme.colors.surface2,
  },
  cardDisabled: {
    opacity: theme.opacity[50],
  },
  choiceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
  },
  choiceBody: {
    flex: 1,
    gap: 2,
  },
  choiceTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  choiceDescription: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  composerCard: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  backButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.destructive,
    lineHeight: 20,
  },
}));
