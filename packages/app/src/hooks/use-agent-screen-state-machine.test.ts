import { describe, expect, it } from "vitest";
import type { Agent } from "@/contexts/session-context";
import {
  deriveAgentScreenViewState,
  type AgentScreenMachineInput,
  type AgentScreenMachineMemory,
} from "./use-agent-screen-state-machine";

function createAgent(id: string): Agent {
  const now = new Date("2026-02-19T00:00:00.000Z");
  return {
    serverId: "server-1",
    id,
    provider: "claude",
    status: "running",
    createdAt: now,
    updatedAt: now,
    lastUserMessageAt: now,
    lastActivityAt: now,
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    runtimeInfo: {
      provider: "claude",
      sessionId: "session-1",
      model: null,
      modeId: null,
    },
    title: "Agent",
    cwd: "/repo",
    model: null,
    labels: {},
  };
}

function createBaseInput(): AgentScreenMachineInput {
  return {
    agent: null,
    placeholderAgent: null,
    missingAgentState: { kind: "idle" },
    isConnected: true,
    isArchivingCurrentAgent: false,
    isHistorySyncing: false,
    needsAuthoritativeSync: false,
    shouldUseOptimisticStream: false,
  };
}

describe("deriveAgentScreenViewState", () => {
  it("returns boot loading before first interactive paint", () => {
    const memory: AgentScreenMachineMemory = {
      hasRenderedReady: false,
      lastReadyAgent: null,
    };
    const input = createBaseInput();

    const result = deriveAgentScreenViewState({ input, memory });

    expect(result.state.tag).toBe("boot");
    if (result.state.tag !== "boot") {
      throw new Error("expected boot state");
    }
    expect(result.state.reason).toBe("loading");
    expect(result.state.source).toBe("none");
  });

  it("stays ready after first paint even if agent is temporarily missing", () => {
    const memory: AgentScreenMachineMemory = {
      hasRenderedReady: true,
      lastReadyAgent: createAgent("agent-1"),
    };
    const input = createBaseInput();

    const result = deriveAgentScreenViewState({ input, memory });

    expect(result.state.tag).toBe("ready");
    if (result.state.tag !== "ready") {
      throw new Error("expected ready state");
    }
    expect(result.state.source).toBe("stale");
    expect(result.state.syncStatus).toBe("idle");
    expect(result.state.agent.id).toBe("agent-1");
  });

  it("shows reconnecting sync status without blocking after first paint", () => {
    const memory: AgentScreenMachineMemory = {
      hasRenderedReady: true,
      lastReadyAgent: createAgent("agent-1"),
    };
    const input: AgentScreenMachineInput = {
      ...createBaseInput(),
      isConnected: false,
    };

    const result = deriveAgentScreenViewState({ input, memory });

    expect(result.state.tag).toBe("ready");
    if (result.state.tag !== "ready") {
      throw new Error("expected ready state");
    }
    expect(result.state.syncStatus).toBe("reconnecting");
  });

  it("shows non-blocking catching-up state after first paint", () => {
    const memory: AgentScreenMachineMemory = {
      hasRenderedReady: true,
      lastReadyAgent: createAgent("agent-1"),
    };
    const input: AgentScreenMachineInput = {
      ...createBaseInput(),
      needsAuthoritativeSync: true,
    };

    const result = deriveAgentScreenViewState({ input, memory });

    expect(result.state.tag).toBe("ready");
    if (result.state.tag !== "ready") {
      throw new Error("expected ready state");
    }
    expect(result.state.syncStatus).toBe("catching_up");
  });

  it("keeps ready with sync_error when refresh fails after first paint", () => {
    const memory: AgentScreenMachineMemory = {
      hasRenderedReady: true,
      lastReadyAgent: createAgent("agent-1"),
    };
    const input: AgentScreenMachineInput = {
      ...createBaseInput(),
      missingAgentState: { kind: "error", message: "network timeout" },
    };

    const result = deriveAgentScreenViewState({ input, memory });

    expect(result.state.tag).toBe("ready");
    if (result.state.tag !== "ready") {
      throw new Error("expected ready state");
    }
    expect(result.state.source).toBe("stale");
    expect(result.state.syncStatus).toBe("sync_error");
    expect(result.state.agent.id).toBe("agent-1");
  });

  it("returns blocking error before first paint when refresh fails", () => {
    const memory: AgentScreenMachineMemory = {
      hasRenderedReady: false,
      lastReadyAgent: null,
    };
    const input: AgentScreenMachineInput = {
      ...createBaseInput(),
      missingAgentState: { kind: "error", message: "network timeout" },
    };

    const result = deriveAgentScreenViewState({ input, memory });

    expect(result.state.tag).toBe("error");
    if (result.state.tag !== "error") {
      throw new Error("expected error state");
    }
    expect(result.state.message).toContain("network timeout");
  });

  it("returns not_found when resolver confirms missing agent", () => {
    const memory: AgentScreenMachineMemory = {
      hasRenderedReady: true,
      lastReadyAgent: createAgent("agent-1"),
    };
    const input: AgentScreenMachineInput = {
      ...createBaseInput(),
      missingAgentState: { kind: "not_found", message: "agent missing" },
    };

    const result = deriveAgentScreenViewState({ input, memory });

    expect(result.state.tag).toBe("not_found");
    if (result.state.tag !== "not_found") {
      throw new Error("expected not_found state");
    }
    expect(result.state.message).toContain("missing");
  });

  it("promotes optimistic source while placeholder is used", () => {
    const memory: AgentScreenMachineMemory = {
      hasRenderedReady: false,
      lastReadyAgent: null,
    };
    const input: AgentScreenMachineInput = {
      ...createBaseInput(),
      placeholderAgent: createAgent("draft-agent"),
      shouldUseOptimisticStream: true,
    };

    const result = deriveAgentScreenViewState({ input, memory });

    expect(result.state.tag).toBe("ready");
    if (result.state.tag !== "ready") {
      throw new Error("expected ready state");
    }
    expect(result.state.source).toBe("optimistic");
  });

  it("keeps optimistic flow non-blocking while transitioning to authoritative stream", () => {
    const initialMemory: AgentScreenMachineMemory = {
      hasRenderedReady: false,
      lastReadyAgent: null,
    };
    const optimisticInput: AgentScreenMachineInput = {
      ...createBaseInput(),
      placeholderAgent: createAgent("draft-agent"),
      shouldUseOptimisticStream: true,
    };

    const optimistic = deriveAgentScreenViewState({
      input: optimisticInput,
      memory: initialMemory,
    });
    expect(optimistic.state.tag).toBe("ready");
    if (optimistic.state.tag !== "ready") {
      throw new Error("expected optimistic ready state");
    }
    expect(optimistic.state.source).toBe("optimistic");

    const handoffInput: AgentScreenMachineInput = {
      ...createBaseInput(),
    };
    const handoff = deriveAgentScreenViewState({
      input: handoffInput,
      memory: optimistic.memory,
    });

    expect(handoff.state.tag).toBe("ready");
    if (handoff.state.tag !== "ready") {
      throw new Error("expected handoff ready state");
    }
    expect(handoff.state.source).toBe("stale");
    expect(handoff.state.agent.id).toBe("draft-agent");
  });
});
