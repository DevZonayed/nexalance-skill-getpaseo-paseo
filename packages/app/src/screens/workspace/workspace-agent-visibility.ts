import type { Agent } from "@/stores/session-store";

function sortAgentsByCreatedAtDescending(agents: Agent[]): Agent[] {
  const sorted = [...agents];
  sorted.sort((left, right) => {
    const createdAtDelta = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }
    return right.lastActivityAt.getTime() - left.lastActivityAt.getTime();
  });
  return sorted;
}

function trimNonEmpty(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function deriveWorkspaceAgentVisibility(input: {
  sessionAgents: Map<string, Agent> | undefined;
  workspaceId: string;
}): {
  visibleAgents: Agent[];
  lookupById: Map<string, Agent>;
} {
  const { sessionAgents, workspaceId } = input;
  if (!sessionAgents || !workspaceId) {
    return {
      visibleAgents: [],
      lookupById: new Map<string, Agent>(),
    };
  }

  const lookupById = new Map<string, Agent>();
  const visible: Agent[] = [];
  for (const agent of sessionAgents.values()) {
    if ((trimNonEmpty(agent.cwd) ?? "") !== workspaceId) {
      continue;
    }
    lookupById.set(agent.id, agent);
    if (!agent.archivedAt) {
      visible.push(agent);
    }
  }

  return {
    visibleAgents: sortAgentsByCreatedAtDescending(visible),
    lookupById,
  };
}

export function canOpenAgentTabFromRoute(input: {
  agentId: string;
  agentsHydrated: boolean;
  workspaceAgentLookup: Map<string, Agent>;
}): boolean {
  if (!input.agentId.trim()) {
    return false;
  }
  if (!input.agentsHydrated) {
    return true;
  }
  return input.workspaceAgentLookup.has(input.agentId);
}
