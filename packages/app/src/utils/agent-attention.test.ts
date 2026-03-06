import { describe, expect, it } from "vitest";

import { shouldClearAgentAttention } from "./agent-attention";

describe("shouldClearAgentAttention", () => {
  it("returns true only when the agent is connected and requires attention", () => {
    expect(
      shouldClearAgentAttention({
        agentId: "agent-1",
        isConnected: true,
        requiresAttention: true,
        attentionReason: "finished",
      })
    ).toBe(true);
  });

  it("returns false when the app is disconnected", () => {
    expect(
      shouldClearAgentAttention({
        agentId: "agent-1",
        isConnected: false,
        requiresAttention: true,
        attentionReason: "finished",
      })
    ).toBe(false);
  });

  it("returns false when attention is already clear", () => {
    expect(
      shouldClearAgentAttention({
        agentId: "agent-1",
        isConnected: true,
        requiresAttention: false,
        attentionReason: null,
      })
    ).toBe(false);
  });

  it("returns false for empty agent ids", () => {
    expect(
      shouldClearAgentAttention({
        agentId: "",
        isConnected: true,
        requiresAttention: true,
        attentionReason: "finished",
      })
    ).toBe(false);
  });

  it("returns false for permission-shaped attention", () => {
    expect(
      shouldClearAgentAttention({
        agentId: "agent-1",
        isConnected: true,
        requiresAttention: true,
        attentionReason: "permission",
      })
    ).toBe(false);
  });
});
