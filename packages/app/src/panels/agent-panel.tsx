import { Bot } from "lucide-react-native";
import invariant from "tiny-invariant";
import { AgentReadyScreen } from "@/screens/agent/agent-ready-screen";
import { ClaudeIcon } from "@/components/icons/claude-icon";
import { CodexIcon } from "@/components/icons/codex-icon";
import { usePaneContext } from "@/panels/pane-context";
import type { PanelDescriptor, PanelRegistration } from "@/panels/panel-registry";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { deriveSidebarStateBucket } from "@/utils/sidebar-agent-state";

function formatProviderLabel(provider: Agent["provider"]): string {
  if (provider === "claude") {
    return "Claude";
  }
  if (provider === "codex") {
    return "Codex";
  }
  if (!provider) {
    return "Agent";
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function resolveWorkspaceAgentTabLabel(title: string | null | undefined): string | null {
  if (typeof title !== "string") {
    return null;
  }
  const normalized = title.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.toLowerCase() === "new agent") {
    return null;
  }
  return normalized;
}

function useAgentPanelDescriptor(
  target: { kind: "agent"; agentId: string },
  context: { serverId: string }
): PanelDescriptor {
  const agent = useSessionStore(
    (state) => state.sessions[context.serverId]?.agents?.get(target.agentId) ?? null
  );
  const provider = agent?.provider ?? "codex";
  const label = resolveWorkspaceAgentTabLabel(agent?.title);
  const icon = provider === "claude" ? ClaudeIcon : provider === "codex" ? CodexIcon : Bot;

  return {
    label: label ?? "",
    subtitle: `${formatProviderLabel(provider)} agent`,
    titleState: label ? "ready" : "loading",
    icon,
    statusBucket: agent
      ? deriveSidebarStateBucket({
          status: agent.status,
          pendingPermissionCount: agent.pendingPermissions.length,
          requiresAttention: agent.requiresAttention,
          attentionReason: agent.attentionReason,
        })
      : null,
  };
}

function AgentPanel() {
  const { serverId, target, openFileInWorkspace } = usePaneContext();
  invariant(target.kind === "agent", "AgentPanel requires agent target");
  return (
    <AgentReadyScreen
      serverId={serverId}
      agentId={target.agentId}
      showExplorerSidebar={false}
      wrapWithExplorerSidebarProvider={false}
      onOpenWorkspaceFile={({ filePath }) => {
        openFileInWorkspace(filePath);
      }}
    />
  );
}

export const agentPanelRegistration: PanelRegistration<"agent"> = {
  kind: "agent",
  component: AgentPanel,
  useDescriptor: useAgentPanelDescriptor,
};
