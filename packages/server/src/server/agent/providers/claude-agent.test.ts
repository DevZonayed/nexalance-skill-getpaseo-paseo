import { describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";
import { ClaudeAgentClient, convertClaudeHistoryEntry } from "./claude-agent.js";
import type { AgentTimelineItem } from "../agent-sdk-types.js";

describe("convertClaudeHistoryEntry", () => {
  test("maps user tool results to timeline items", () => {
    const toolUseId = "toolu_test";
    const entry = {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: [{ type: "text", text: "file contents" }],
          },
        ],
      },
    };

    const stubTimeline: AgentTimelineItem[] = [
      {
        type: "tool_call",
        server: "editor",
        tool: "read_file",
        status: "completed",
      },
    ];

    const mapBlocks = vi.fn().mockReturnValue(stubTimeline);
    const result = convertClaudeHistoryEntry(entry, mapBlocks);

    expect(result).toEqual(stubTimeline);
    expect(mapBlocks).toHaveBeenCalledTimes(1);
    expect(Array.isArray(mapBlocks.mock.calls[0][0])).toBe(true);
  });

  test("returns user messages when no tool blocks exist", () => {
    const entry = {
      type: "user",
      message: {
        role: "user",
        content: "Run npm test",
      },
    };

    expect(convertClaudeHistoryEntry(entry, () => [])).toEqual([
      {
        type: "user_message",
        text: "Run npm test",
      },
    ]);
  });

  test("converts compact boundary metadata variants", () => {
    const fixtures = [
      {
        entry: {
          type: "system",
          subtype: "compact_boundary",
          compactMetadata: { trigger: "manual", preTokens: 12 },
        },
        expected: { trigger: "manual", preTokens: 12 },
      },
      {
        entry: {
          type: "system",
          subtype: "compact_boundary",
          compact_metadata: { trigger: "manual", pre_tokens: 34 },
        },
        expected: { trigger: "manual", preTokens: 34 },
      },
      {
        entry: {
          type: "system",
          subtype: "compact_boundary",
          compactionMetadata: { trigger: "auto", preTokens: 56 },
        },
        expected: { trigger: "auto", preTokens: 56 },
      },
    ] as const;

    for (const fixture of fixtures) {
      expect(convertClaudeHistoryEntry(fixture.entry, () => [])).toEqual([
        {
          type: "compaction",
          status: "completed",
          trigger: fixture.expected.trigger,
          preTokens: fixture.expected.preTokens,
        },
      ]);
    }
  });

  test("skips synthetic user entries", () => {
    const entry = {
      type: "user",
      isSynthetic: true,
      message: {
        role: "user",
        content: [{ type: "text", text: "Base directory for this skill: /tmp/skill" }],
      },
    };

    const mapBlocks = vi.fn().mockReturnValue([]);
    const result = convertClaudeHistoryEntry(entry, mapBlocks);

    expect(result).toEqual([]);
    expect(mapBlocks).not.toHaveBeenCalled();
  });

  test("maps task notifications to synthetic tool calls", () => {
    const entry = {
      type: "system",
      subtype: "task_notification",
      uuid: "task-note-system-1",
      task_id: "bg-fail-1",
      status: "failed",
      summary: "Background task failed",
      output_file: "/tmp/bg-fail-1.txt",
    };

    expect(convertClaudeHistoryEntry(entry, () => [])).toEqual([
      {
        type: "tool_call",
        callId: "task_notification_task-note-system-1",
        name: "task_notification",
        status: "failed",
        error: { message: "Background task failed" },
        detail: {
          type: "plain_text",
          label: "Background task failed",
          icon: "wrench",
          text: "Background task failed",
        },
        metadata: {
          synthetic: true,
          source: "claude_task_notification",
          taskId: "bg-fail-1",
          status: "failed",
          outputFile: "/tmp/bg-fail-1.txt",
        },
      },
    ]);
  });

  test("passes assistant content blocks through to the mapper", () => {
    const entry = {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Let me reason about this..." },
          { type: "text", text: "Here is my answer." },
        ],
      },
    };

    const mappedTimeline = [
      { type: "reasoning", text: "Let me reason about this..." },
      { type: "assistant_message", text: "Here is my answer." },
    ];
    const mapBlocks = vi.fn().mockReturnValue(mappedTimeline);

    expect(convertClaudeHistoryEntry(entry, mapBlocks)).toEqual(mappedTimeline);
    expect(mapBlocks).toHaveBeenCalledWith(entry.message.content);
  });
});

// NOTE: Turn handoff integration tests are covered by the daemon E2E test:
// "interrupting message should produce coherent text without garbling from race condition"
// in daemon.e2e.test.ts which exercises the full flow through the WebSocket API.

describe("ClaudeAgentClient.listModels", () => {
  const logger = createTestLogger();

  test(
    "returns models with required fields",
    async () => {
      const client = new ClaudeAgentClient({ logger });
      const models = await client.listModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      for (const model of models) {
        expect(model.provider).toBe("claude");
        expect(typeof model.id).toBe("string");
        expect(model.id.length).toBeGreaterThan(0);
        expect(typeof model.label).toBe("string");
        expect(model.label.length).toBeGreaterThan(0);
      }

      const modelIds = models.map((model) => model.id);
      expect(
        modelIds.some(
          (id) =>
            id.includes("claude") ||
            id.includes("sonnet") ||
            id.includes("opus") ||
            id.includes("haiku")
        )
      ).toBe(true);
    },
    60_000
  );
});
