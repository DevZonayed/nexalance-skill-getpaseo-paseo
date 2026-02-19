import { useRef } from "react";
import type { Agent } from "@/contexts/session-context";

export type AgentScreenMissingState =
  | { kind: "idle" }
  | { kind: "resolving" }
  | { kind: "not_found"; message: string }
  | { kind: "error"; message: string };

export interface AgentScreenMachineInput {
  agent: Agent | null;
  placeholderAgent: Agent | null;
  missingAgentState: AgentScreenMissingState;
  isConnected: boolean;
  isArchivingCurrentAgent: boolean;
  isHistorySyncing: boolean;
  needsAuthoritativeSync: boolean;
  shouldUseOptimisticStream: boolean;
}

export interface AgentScreenMachineMemory {
  hasRenderedReady: boolean;
  lastReadyAgent: Agent | null;
}

export type AgentScreenSyncStatus =
  | "idle"
  | "catching_up"
  | "reconnecting"
  | "sync_error";

export type AgentScreenViewState =
  | {
      tag: "boot";
      reason: "loading" | "resolving";
      source: "none";
    }
  | {
      tag: "not_found";
      message: string;
    }
  | {
      tag: "error";
      message: string;
    }
  | {
      tag: "ready";
      agent: Agent;
      source: "authoritative" | "optimistic" | "stale";
      syncStatus: AgentScreenSyncStatus;
      isArchiving: boolean;
    };

export function deriveAgentScreenViewState({
  input,
  memory,
}: {
  input: AgentScreenMachineInput;
  memory: AgentScreenMachineMemory;
}): { state: AgentScreenViewState; memory: AgentScreenMachineMemory } {
  const nextMemory: AgentScreenMachineMemory = {
    hasRenderedReady: memory.hasRenderedReady,
    lastReadyAgent: memory.lastReadyAgent,
  };

  const candidateAgent = input.agent ?? input.placeholderAgent;
  if (candidateAgent) {
    nextMemory.hasRenderedReady = true;
    nextMemory.lastReadyAgent = candidateAgent;
  }

  if (input.missingAgentState.kind === "not_found") {
    return {
      state: {
        tag: "not_found",
        message: input.missingAgentState.message,
      },
      memory: nextMemory,
    };
  }

  if (input.missingAgentState.kind === "error" && !nextMemory.hasRenderedReady) {
    return {
      state: {
        tag: "error",
        message: input.missingAgentState.message,
      },
      memory: nextMemory,
    };
  }

  const displayAgent =
    candidateAgent ?? (nextMemory.hasRenderedReady ? nextMemory.lastReadyAgent : null);
  if (!displayAgent) {
    return {
      state: {
        tag: "boot",
        reason: input.missingAgentState.kind === "resolving" ? "resolving" : "loading",
        source: "none",
      },
      memory: nextMemory,
    };
  }

  const source: "authoritative" | "optimistic" | "stale" = input.agent
    ? "authoritative"
    : input.shouldUseOptimisticStream
      ? "optimistic"
      : "stale";

  let syncStatus: AgentScreenSyncStatus = "idle";
  if (!input.isConnected) {
    syncStatus = "reconnecting";
  } else if (input.missingAgentState.kind === "error") {
    syncStatus = "sync_error";
  } else if (input.needsAuthoritativeSync || input.isHistorySyncing) {
    syncStatus = "catching_up";
  }

  return {
    state: {
      tag: "ready",
      agent: displayAgent,
      source,
      syncStatus,
      isArchiving: input.isArchivingCurrentAgent,
    },
    memory: nextMemory,
  };
}

export function useAgentScreenStateMachine({
  routeKey,
  input,
}: {
  routeKey: string;
  input: AgentScreenMachineInput;
}): AgentScreenViewState {
  const routeKeyRef = useRef(routeKey);
  const memoryRef = useRef<AgentScreenMachineMemory>({
    hasRenderedReady: false,
    lastReadyAgent: null,
  });

  if (routeKeyRef.current !== routeKey) {
    routeKeyRef.current = routeKey;
    memoryRef.current = {
      hasRenderedReady: false,
      lastReadyAgent: null,
    };
  }

  const result = deriveAgentScreenViewState({
    input,
    memory: memoryRef.current,
  });
  memoryRef.current = result.memory;
  return result.state;
}
