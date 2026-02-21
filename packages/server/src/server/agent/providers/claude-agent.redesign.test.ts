import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";
import { AgentManager } from "../agent-manager.js";
import { ClaudeAgentClient } from "./claude-agent.js";
import type { AgentStreamEvent } from "../agent-sdk-types.js";

const sdkMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: sdkMocks.query,
}));

type QueryMock = {
  next: ReturnType<typeof vi.fn>;
  interrupt: ReturnType<typeof vi.fn>;
  return: ReturnType<typeof vi.fn>;
  setPermissionMode: ReturnType<typeof vi.fn>;
  setModel: ReturnType<typeof vi.fn>;
  supportedModels: ReturnType<typeof vi.fn>;
  supportedCommands: ReturnType<typeof vi.fn>;
  rewindFiles: ReturnType<typeof vi.fn>;
};

function buildUsage() {
  return {
    input_tokens: 1,
    cache_read_input_tokens: 0,
    output_tokens: 1,
  };
}

function createPromptUuidReader(prompt: AsyncIterable<unknown>) {
  const iterator = prompt[Symbol.asyncIterator]();
  let cached: Promise<string | null> | null = null;
  return async () => {
    if (!cached) {
      cached = iterator.next().then((next) => {
        if (next.done) {
          return null;
        }
        const value = next.value as { uuid?: unknown } | undefined;
        return typeof value?.uuid === "string" ? value.uuid : null;
      });
    }
    return cached;
  };
}

function createBaseQueryMock(nextImpl: QueryMock["next"]): QueryMock {
  return {
    next: nextImpl,
    interrupt: vi.fn(async () => undefined),
    return: vi.fn(async () => undefined),
    setPermissionMode: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    supportedModels: vi.fn(async () => [{ value: "opus", displayName: "Opus" }]),
    supportedCommands: vi.fn(async () => []),
    rewindFiles: vi.fn(async () => ({ canRewind: true })),
  };
}

async function createSession() {
  const client = new ClaudeAgentClient({ logger: createTestLogger() });
  return client.createSession({
    provider: "claude",
    cwd: process.cwd(),
  });
}

async function collectUntilTerminal(
  stream: AsyncGenerator<AgentStreamEvent>
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
    if (
      event.type === "turn_completed" ||
      event.type === "turn_failed" ||
      event.type === "turn_canceled"
    ) {
      break;
    }
  }
  return events;
}

async function waitForCondition(
  check: () => boolean,
  timeoutMs: number
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}

describe("ClaudeAgentSession redesign invariants", () => {
  beforeEach(() => {
    sdkMocks.query.mockReset();
  });

  afterEach(() => {
    sdkMocks.query.mockReset();
  });

  test("routes by deterministic identifier priority: task_id > parent_message_id > message_id", async () => {
    const session = await createSession();
    const internal = session as unknown as {
      createRun: (owner: "autonomous", queue: null) => { id: string };
      runTracker: {
        bindIdentifiers: (
          run: { id: string },
          ids: { taskId: string | null; parentMessageId: string | null; messageId: string | null }
        ) => void;
      };
      routeMessage: (input: {
        message: AgentStreamEvent | Record<string, unknown>;
        identifiers: { taskId: string | null; parentMessageId: string | null; messageId: string | null };
        metadataOnly: boolean;
      }) => { run: { id: string } | null; reason: string };
      turnState: "autonomous";
    };

    const taskRun = internal.createRun("autonomous", null);
    internal.runTracker.bindIdentifiers(taskRun, {
      taskId: "task-A",
      parentMessageId: null,
      messageId: "msg-A",
    });

    const parentRun = internal.createRun("autonomous", null);
    internal.runTracker.bindIdentifiers(parentRun, {
      taskId: null,
      parentMessageId: "parent-B",
      messageId: "msg-B",
    });

    const messageRun = internal.createRun("autonomous", null);
    internal.runTracker.bindIdentifiers(messageRun, {
      taskId: null,
      parentMessageId: null,
      messageId: "msg-C",
    });

    internal.turnState = "autonomous";

    const taskPriorityRoute = internal.routeMessage({
      message: { type: "assistant", message: { content: "task-priority" } },
      identifiers: {
        taskId: "task-A",
        parentMessageId: "parent-B",
        messageId: "msg-C",
      },
      metadataOnly: false,
    });
    expect(taskPriorityRoute.reason).toBe("task_id");
    expect(taskPriorityRoute.run?.id).toBe(taskRun.id);

    const parentPriorityRoute = internal.routeMessage({
      message: { type: "assistant", message: { content: "parent-priority" } },
      identifiers: {
        taskId: null,
        parentMessageId: "parent-B",
        messageId: "msg-C",
      },
      metadataOnly: false,
    });
    expect(parentPriorityRoute.reason).toBe("parent_message_id");
    expect(parentPriorityRoute.run?.id).toBe(parentRun.id);

    const messagePriorityRoute = internal.routeMessage({
      message: { type: "assistant", message: { content: "message-priority" } },
      identifiers: {
        taskId: null,
        parentMessageId: null,
        messageId: "msg-C",
      },
      metadataOnly: false,
    });
    expect(messagePriorityRoute.reason).toBe("message_id");
    expect(messagePriorityRoute.run?.id).toBe(messageRun.id);

    await session.close();
  });

  test("does not route unbound events to foreground before prompt replay is observed", async () => {
    const session = await createSession();
    const internal = session as unknown as {
      createRun: (owner: "foreground" | "autonomous", queue: unknown) => { id: string };
      runTracker: {
        bindIdentifiers: (
          run: { id: string },
          ids: { taskId: string | null; parentMessageId: string | null; messageId: string | null }
        ) => void;
      };
      activeForegroundTurn: { runId: string; queue: unknown } | null;
      turnState: "foreground";
      routeMessage: (input: {
        message: Record<string, unknown>;
        identifiers: { taskId: string | null; parentMessageId: string | null; messageId: string | null };
        metadataOnly: boolean;
      }) => { run: { id: string } | null; reason: string };
    };

    const foregroundQueueStub = {
      push: () => undefined,
      end: () => undefined,
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true as const, value: undefined }),
      }),
    };
    const foregroundRun = internal.createRun("foreground", foregroundQueueStub);
    internal.turnState = "foreground";
    internal.activeForegroundTurn = {
      runId: foregroundRun.id,
      queue: foregroundQueueStub,
    };

    const unboundBeforeReplay = internal.routeMessage({
      message: { type: "assistant", message: { content: "stale-before-replay" } },
      identifiers: {
        taskId: null,
        parentMessageId: null,
        messageId: null,
      },
      metadataOnly: false,
    });
    expect(unboundBeforeReplay.reason).toBe("fallback");
    expect(unboundBeforeReplay.run?.id).not.toBe(foregroundRun.id);

    const promptReplayId = "foreground-replay-id";
    internal.runTracker.bindIdentifiers(foregroundRun, {
      taskId: null,
      parentMessageId: null,
      messageId: promptReplayId,
    });
    const replayRoute = internal.routeMessage({
      message: {
        type: "user",
        message: { role: "user", content: "prompt replay" },
        uuid: promptReplayId,
      },
      identifiers: {
        taskId: null,
        parentMessageId: null,
        messageId: promptReplayId,
      },
      metadataOnly: false,
    });
    expect(replayRoute.reason).toBe("message_id");
    expect(replayRoute.run?.id).toBe(foregroundRun.id);

    await session.close();
  });

  test("tracks run lifecycle transitions for success, error, and interrupt", async () => {
    const session = await createSession();
    let streamCase: "success" | "error" | "interrupt" = "success";

    sdkMocks.query.mockImplementation(({ prompt }: { prompt: AsyncIterable<unknown> }) => {
      const readPromptUuid = createPromptUuidReader(prompt);
      let step = 0;
      let interruptRequested = false;

      const mock = createBaseQueryMock(
        vi.fn(async () => {
          if (step === 0) {
            step += 1;
            return {
              done: false,
              value: {
                type: "system",
                subtype: "init",
                session_id: "redesign-lifecycle-session",
                permissionMode: "default",
                model: "opus",
              },
            };
          }
          if (step === 1) {
            step += 1;
            return {
              done: false,
              value: {
                type: "user",
                message: { role: "user", content: "prompt replay" },
                parent_tool_use_id: null,
                uuid: (await readPromptUuid()) ?? "missing-prompt-uuid",
                session_id: "redesign-lifecycle-session",
              },
            };
          }
          if (step === 2) {
            step += 1;
            return {
              done: false,
              value: {
                type: "assistant",
                message: { content: "assistant output" },
              },
            };
          }
          if (streamCase === "interrupt") {
            if (!interruptRequested) {
              await new Promise<void>((resolve) => setTimeout(resolve, 50));
              return {
                done: false,
                value: {
                  type: "assistant",
                  message: { content: "waiting for interrupt" },
                },
              };
            }
            return { done: true, value: undefined };
          }
          if (step === 3) {
            step += 1;
            if (streamCase === "success") {
              return {
                done: false,
                value: {
                  type: "result",
                  subtype: "success",
                  usage: buildUsage(),
                  total_cost_usd: 0,
                },
              };
            }
            return {
              done: false,
              value: {
                type: "result",
                subtype: "error",
                usage: buildUsage(),
                errors: ["simulated failure"],
                total_cost_usd: 0,
              },
            };
          }
          return { done: true, value: undefined };
        })
      );

      mock.interrupt.mockImplementation(async () => {
        interruptRequested = true;
      });
      return mock;
    });

    streamCase = "success";
    const successEvents = await collectUntilTerminal(session.stream("success prompt"));
    expect(successEvents.some((event) => event.type === "turn_completed")).toBe(
      true
    );
    expect(successEvents.some((event) => event.type === "turn_failed")).toBe(
      false
    );
    expect(successEvents.some((event) => event.type === "turn_canceled")).toBe(
      false
    );

    streamCase = "error";
    const errorEvents = await collectUntilTerminal(session.stream("error prompt"));
    expect(errorEvents.some((event) => event.type === "turn_failed")).toBe(true);
    expect(errorEvents.some((event) => event.type === "turn_completed")).toBe(
      false
    );

    streamCase = "interrupt";
    const interruptStream = session.stream("interrupt prompt");
    const interruptEvents: AgentStreamEvent[] = [];
    for await (const event of interruptStream) {
      interruptEvents.push(event);
      if (
        event.type === "timeline" &&
        event.item.type === "assistant_message"
      ) {
        await session.interrupt();
      }
      if (event.type === "turn_canceled") {
        break;
      }
    }
    expect(interruptEvents.some((event) => event.type === "turn_canceled")).toBe(
      true
    );

    await session.close();
  });

  test("assembles assistant timeline when message_delta arrives before message_start", async () => {
    sdkMocks.query.mockImplementation(({ prompt }: { prompt: AsyncIterable<unknown> }) => {
      const readPromptUuid = createPromptUuidReader(prompt);
      let step = 0;
      return createBaseQueryMock(
        vi.fn(async () => {
          if (step === 0) {
            step += 1;
            return {
              done: false,
              value: {
                type: "system",
                subtype: "init",
                session_id: "redesign-timeline-session",
                permissionMode: "default",
                model: "opus",
              },
            };
          }
          if (step === 1) {
            step += 1;
            return {
              done: false,
              value: {
                type: "user",
                message: { role: "user", content: "timeline prompt" },
                parent_tool_use_id: null,
                uuid: (await readPromptUuid()) ?? "missing-prompt-uuid",
                session_id: "redesign-timeline-session",
              },
            };
          }
          if (step === 2) {
            step += 1;
            return {
              done: false,
              value: {
                type: "stream_event",
                event: {
                  type: "content_block_delta",
                  delta: { type: "text_delta", text: "HELLO " },
                },
              },
            };
          }
          if (step === 3) {
            step += 1;
            return {
              done: false,
              value: {
                type: "stream_event",
                event: {
                  type: "message_start",
                  message: { id: "message-1", role: "assistant", model: "opus" },
                },
              },
            };
          }
          if (step === 4) {
            step += 1;
            return {
              done: false,
              value: {
                type: "stream_event",
                event: {
                  type: "content_block_delta",
                  message_id: "message-1",
                  delta: { type: "text_delta", text: "WORLD" },
                },
              },
            };
          }
          if (step === 5) {
            step += 1;
            return {
              done: false,
              value: {
                type: "stream_event",
                event: {
                  type: "message_stop",
                  message_id: "message-1",
                },
              },
            };
          }
          if (step === 6) {
            step += 1;
            return {
              done: false,
              value: {
                type: "result",
                subtype: "success",
                usage: buildUsage(),
                total_cost_usd: 0,
              },
            };
          }
          return { done: true, value: undefined };
        })
      );
    });

    const session = await createSession();
    const events = await collectUntilTerminal(session.stream("timeline prompt"));
    const assistantText = events
      .filter(
        (event): event is Extract<AgentStreamEvent, { type: "timeline" }> =>
          event.type === "timeline" && event.item.type === "assistant_message"
      )
      .map((event) => event.item.text)
      .join("");

    expect(assistantText).toContain("HELLO WORLD");

    await session.close();
  });

  test("does not use stream_event uuid as assistant message identity when message_id is missing", async () => {
    sdkMocks.query.mockImplementation(({ prompt }: { prompt: AsyncIterable<unknown> }) => {
      const readPromptUuid = createPromptUuidReader(prompt);
      let step = 0;
      return createBaseQueryMock(
        vi.fn(async () => {
          if (step === 0) {
            step += 1;
            return {
              done: false,
              value: {
                type: "system",
                subtype: "init",
                session_id: "redesign-stream-event-uuid-session",
                permissionMode: "default",
                model: "opus",
              },
            };
          }
          if (step === 1) {
            step += 1;
            return {
              done: false,
              value: {
                type: "user",
                message: { role: "user", content: "uuid fallback prompt" },
                parent_tool_use_id: null,
                uuid: (await readPromptUuid()) ?? "missing-prompt-uuid",
                session_id: "redesign-stream-event-uuid-session",
              },
            };
          }
          if (step === 2) {
            step += 1;
            return {
              done: false,
              value: {
                type: "stream_event",
                uuid: "stream-event-uuid-1",
                event: {
                  type: "message_start",
                  message: { role: "assistant", model: "opus" },
                },
              },
            };
          }
          if (step === 3) {
            step += 1;
            return {
              done: false,
              value: {
                type: "stream_event",
                uuid: "stream-event-uuid-2",
                event: {
                  type: "content_block_delta",
                  delta: { type: "text_delta", text: "HELLO " },
                },
              },
            };
          }
          if (step === 4) {
            step += 1;
            return {
              done: false,
              value: {
                type: "stream_event",
                uuid: "stream-event-uuid-3",
                event: {
                  type: "content_block_delta",
                  delta: { type: "text_delta", text: "WORLD" },
                },
              },
            };
          }
          if (step === 5) {
            step += 1;
            return {
              done: false,
              value: {
                type: "stream_event",
                uuid: "stream-event-uuid-4",
                event: {
                  type: "message_stop",
                },
              },
            };
          }
          if (step === 6) {
            step += 1;
            return {
              done: false,
              value: {
                type: "result",
                subtype: "success",
                usage: buildUsage(),
                total_cost_usd: 0,
              },
            };
          }
          return { done: true, value: undefined };
        })
      );
    });

    const session = await createSession();
    const events = await collectUntilTerminal(session.stream("uuid fallback prompt"));
    const assistantText = events
      .filter(
        (event): event is Extract<AgentStreamEvent, { type: "timeline" }> =>
          event.type === "timeline" && event.item.type === "assistant_message"
      )
      .map((event) => event.item.text)
      .join("");

    expect(assistantText).toContain("HELLO WORLD");

    const assembler = session as unknown as {
      timelineAssembler: { messages: Map<string, unknown> };
    };
    expect(assembler.timelineAssembler.messages.size).toBe(1);

    await session.close();
  });

  test("surfaces autonomous running transitions through manager-visible events during foreground overlap", async () => {
    sdkMocks.query.mockImplementation(({ prompt }: { prompt: AsyncIterable<unknown> }) => {
      const readPromptUuid = createPromptUuidReader(prompt);
      let step = 0;
      return createBaseQueryMock(
        vi.fn(async () => {
          if (step === 0) {
            step += 1;
            return {
              done: false,
              value: {
                type: "system",
                subtype: "init",
                session_id: "redesign-manager-overlap-session",
                permissionMode: "default",
                model: "opus",
              },
            };
          }
          if (step === 1) {
            step += 1;
            return {
              done: false,
              value: {
                type: "user",
                message: { role: "user", content: "foreground prompt replay" },
                parent_tool_use_id: null,
                uuid: (await readPromptUuid()) ?? "missing-prompt-uuid",
                session_id: "redesign-manager-overlap-session",
              },
            };
          }
          if (step === 2) {
            step += 1;
            return {
              done: false,
              value: {
                type: "assistant",
                message: { content: "FOREGROUND_DONE" },
              },
            };
          }
          if (step === 3) {
            step += 1;
            return {
              done: false,
              value: {
                type: "result",
                subtype: "success",
                usage: buildUsage(),
                total_cost_usd: 0,
              },
            };
          }
          if (step === 4) {
            step += 1;
            return {
              done: false,
              value: {
                type: "user",
                message: {
                  role: "user",
                  content:
                    "<task-notification>\n<task-id>bg-1</task-id>\n<status>completed</status>\n</task-notification>",
                },
                parent_tool_use_id: null,
                uuid: "task-note-overlap-1",
                session_id: "redesign-manager-overlap-session",
              },
            };
          }
          if (step === 5) {
            step += 1;
            return {
              done: false,
              value: {
                type: "assistant",
                message: { content: "AUTONOMOUS_OVERLAP_DONE" },
              },
            };
          }
          if (step === 6) {
            step += 1;
            return {
              done: false,
              value: {
                type: "result",
                subtype: "success",
                usage: buildUsage(),
                total_cost_usd: 0,
              },
            };
          }
          return { done: true, value: undefined };
        })
      );
    });

    const logger = createTestLogger();
    const manager = new AgentManager({
      clients: {
        claude: new ClaudeAgentClient({ logger }),
      },
      logger,
    });

    const agent = await manager.createAgent({
      provider: "claude",
      cwd: process.cwd(),
    });

    const runningStateEvents: string[] = [];
    const turnStartedEvents: AgentStreamEvent[] = [];
    const unsubscribe = manager.subscribe(
      (event) => {
        if (event.type === "agent_state" && event.agent.id === agent.id) {
          if (event.agent.lifecycle === "running") {
            runningStateEvents.push(event.agent.lifecycle);
          }
          return;
        }
        if (
          event.type === "agent_stream" &&
          event.agentId === agent.id &&
          event.event.type === "turn_started"
        ) {
          turnStartedEvents.push(event.event);
        }
      },
      { agentId: agent.id, replayState: true }
    );

    const foregroundEvents = await collectUntilTerminal(
      manager.streamAgent(agent.id, "foreground prompt")
    );
    expect(
      foregroundEvents.some((event) => event.type === "turn_completed")
    ).toBe(true);

    await waitForCondition(() => turnStartedEvents.length >= 2, 5_000);
    await waitForCondition(() => runningStateEvents.length >= 2, 5_000);

    const timeline = manager.getTimeline(agent.id);
    expect(
      timeline.some(
        (item) =>
          item.type === "assistant_message" &&
          item.text.includes("FOREGROUND_DONE")
      )
    ).toBe(true);
    expect(
      timeline.some(
        (item) =>
          item.type === "assistant_message" &&
          item.text.includes("AUTONOMOUS_OVERLAP_DONE")
      )
    ).toBe(true);

    unsubscribe();
    await manager.closeAgent(agent.id);
  });
});
