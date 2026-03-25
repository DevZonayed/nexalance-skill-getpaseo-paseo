import { describe, test, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";

import { createTestPaseoDaemon } from "../test-utils/paseo-daemon.js";
import { DaemonClient } from "../test-utils/daemon-client.js";
import { ClaudeAgentClient } from "../agent/providers/claude-agent.js";
import { getFullAccessConfig, isProviderAvailable } from "./agent-configs.js";
import { createMessageCollector } from "../test-utils/message-collector.js";
import type { AgentTimelineItem } from "../agent/agent-sdk-types.js";
import type { SessionOutboundMessage } from "../messages.js";

function tmpCwd(): string {
  return mkdtempSync(path.join(tmpdir(), "daemon-real-tool-interrupt-"));
}

function hasRunningToolCall(messages: SessionOutboundMessage[], agentId: string): boolean {
  for (const m of messages) {
    if (
      m.type === "agent_stream" &&
      m.payload.agentId === agentId &&
      m.payload.event.type === "timeline" &&
      m.payload.event.item.type === "tool_call" &&
      m.payload.event.item.status === "running"
    ) {
      return true;
    }
  }
  return false;
}

describe("daemon E2E (real claude) - send message during tool call", () => {
  test.runIf(isProviderAvailable("claude"))(
    "sending a message while a tool call is running starts a new turn",
    async () => {
      const logger = pino({ level: "silent" });
      const cwd = tmpCwd();
      const daemon = await createTestPaseoDaemon({
        agentClients: { claude: new ClaudeAgentClient({ logger }) },
        logger,
      });

      const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });

      try {
        await client.connect();
        await client.fetchAgents({ subscribe: { subscriptionId: "primary" } });

        const agent = await client.createAgent({
          cwd,
          title: "tool-interrupt-repro",
          ...getFullAccessConfig("claude"),
        });

        const collector = createMessageCollector(client);

        // Step 1: Ask Claude to run sleep 60 in the foreground
        await client.sendMessage(
          agent.id,
          "Run the bash command `sleep 60` and wait for it to complete. Do not run it in the background.",
        );

        // Step 2: Wait for the agent to be running
        await client.waitForAgentUpsert(
          agent.id,
          (snapshot) => snapshot.status === "running",
          60_000,
        );

        // Step 3: Wait for a tool call to appear as "running" in the stream
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timed out waiting for running tool call"));
          }, 90_000);

          if (hasRunningToolCall(collector.messages, agent.id)) {
            clearTimeout(timeout);
            resolve();
            return;
          }

          const unsub = client.subscribeRawMessages((message) => {
            if (
              message.type === "agent_stream" &&
              message.payload.agentId === agent.id &&
              message.payload.event.type === "timeline" &&
              message.payload.event.item.type === "tool_call" &&
              message.payload.event.item.status === "running"
            ) {
              clearTimeout(timeout);
              unsub();
              resolve();
            }
          });
        });

        // Step 4: Send a second message while the tool call is still running
        await client.sendMessage(agent.id, "Reply with exactly: INTERRUPT_RECEIVED");

        // Step 5: Wait for the agent to finish — this is the critical assertion.
        // If the bug is present, the agent will stop and never start a new turn.
        const finish = await client.waitForFinish(agent.id, 120_000);
        expect(finish.status).toBe("idle");

        // Step 6: Verify the agent actually responded to our second message
        const timeline = await client.fetchAgentTimeline(agent.id, { limit: 100 });
        const assistantTexts = timeline.entries
          .filter((entry) => entry.item.type === "assistant_message")
          .map((entry) => {
            const item = entry.item as Extract<AgentTimelineItem, { type: "assistant_message" }>;
            return item.text;
          });

        const responded = assistantTexts.some((text) =>
          text.toUpperCase().includes("INTERRUPT_RECEIVED"),
        );
        expect(responded).toBe(true);

        collector.unsubscribe();
      } finally {
        await client.close();
        await daemon.close();
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    300_000,
  );
});
