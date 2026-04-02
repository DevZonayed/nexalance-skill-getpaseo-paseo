import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
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

      <View style={styles.section}>
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

      <Pressable
        accessibilityRole="button"
        disabled={pendingAction !== null}
        onPress={() => void handleCreateTerminal()}
        style={[
          styles.terminalLink,
          pendingAction !== null && pendingAction !== "terminal" ? { opacity: 0.5 } : undefined,
        ]}
      >
        {pendingAction === "terminal" ? (
          <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
        ) : null}
        <Text style={styles.terminalLinkText}>{"\u2192"} Open terminal</Text>
      </Pressable>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    gap: theme.spacing[1],
  },
  workspaceTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  workspacePath: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  section: {
    gap: theme.spacing[3],
    marginHorizontal: -theme.spacing[6],
  },
  terminalLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: theme.spacing[2],
  },
  terminalLinkText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.destructive,
    lineHeight: 20,
  },
}));
