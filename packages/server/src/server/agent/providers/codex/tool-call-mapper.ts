import { z } from "zod";

import type { ToolCallDetail, ToolCallTimelineItem } from "../../agent-sdk-types.js";
import {
  StandardEditInputSchema,
  StandardEditOutputSchema,
  StandardReadChunkSchema,
  StandardReadPathInputSchema,
  StandardSearchInputSchema,
  StandardShellInputSchema,
  StandardShellOutputSchema,
  StandardWriteInputSchema,
  StandardWriteOutputSchema,
  toStandardEditDetail,
  toStandardSearchDetail,
  toStandardShellDetail,
  toStandardWriteDetail,
} from "../standard-tool-call-schemas.js";
import {
  CODEX_MCP_KNOWN_TOOL_ALIASES,
  CODEX_ROLLOUT_KNOWN_TOOL_ALIASES,
  coerceToolCallId,
  commandFromValue,
  flattenReadContent as flattenToolReadContent,
  nonEmptyString,
  truncateDiffText,
  unionToolDetailSchemas,
} from "../tool-call-mapper-utils.js";

type CodexMapperOptions = { cwd?: string | null };

const FAILED_STATUSES = new Set(["failed", "error", "errored", "rejected", "denied"]);
const CANCELED_STATUSES = new Set(["canceled", "cancelled", "interrupted", "aborted"]);
const COMPLETED_STATUSES = new Set(["completed", "complete", "done", "success", "succeeded"]);

const CodexRolloutToolCallParamsSchema = z
  .object({
    callId: z.string().optional().nullable(),
    name: z.string().min(1),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    error: z.unknown().optional(),
  })
  .passthrough();

const CommandValueSchema = z.union([z.string(), z.array(z.string())]);

const CodexShellInputSchema = StandardShellInputSchema;
const CodexShellOutputSchema = StandardShellOutputSchema;
const CodexReadArgumentsSchema = StandardReadPathInputSchema;
const CodexWriteArgumentsSchema = StandardWriteInputSchema;
const CodexWriteResultSchema = StandardWriteOutputSchema;
const CodexEditArgumentsSchema = StandardEditInputSchema;
const CodexEditResultSchema = StandardEditOutputSchema;
const CodexSearchArgumentsSchema = StandardSearchInputSchema;

const CodexReadContentSchema = z.union([
  z.string(),
  StandardReadChunkSchema,
  z.array(StandardReadChunkSchema),
]);

const CodexReadPayloadSchema = z.union([
  z
    .object({
      content: CodexReadContentSchema,
      text: CodexReadContentSchema.optional(),
      output: CodexReadContentSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      content: CodexReadContentSchema.optional(),
      text: CodexReadContentSchema,
      output: CodexReadContentSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      content: CodexReadContentSchema.optional(),
      text: CodexReadContentSchema.optional(),
      output: CodexReadContentSchema,
    })
    .passthrough(),
]);

const CodexReadResultWithPathSchema = z.union([
  z
    .object({
      path: z.string(),
      content: CodexReadContentSchema.optional(),
      text: CodexReadContentSchema.optional(),
      output: CodexReadContentSchema.optional(),
    })
    .passthrough()
    .transform((value) => ({
      filePath: value.path,
      content:
        flattenReadContent(value.content) ??
        flattenReadContent(value.text) ??
        flattenReadContent(value.output),
    })),
  z
    .object({
      file_path: z.string(),
      content: CodexReadContentSchema.optional(),
      text: CodexReadContentSchema.optional(),
      output: CodexReadContentSchema.optional(),
    })
    .passthrough()
    .transform((value) => ({
      filePath: value.file_path,
      content:
        flattenReadContent(value.content) ??
        flattenReadContent(value.text) ??
        flattenReadContent(value.output),
    })),
  z
    .object({
      filePath: z.string(),
      content: CodexReadContentSchema.optional(),
      text: CodexReadContentSchema.optional(),
      output: CodexReadContentSchema.optional(),
    })
    .passthrough()
    .transform((value) => ({
      filePath: value.filePath,
      content:
        flattenReadContent(value.content) ??
        flattenReadContent(value.text) ??
        flattenReadContent(value.output),
    })),
]);

const CodexReadResultSchema = z.union([
  z.string().transform((value) => ({ filePath: undefined, content: nonEmptyString(value) })),
  StandardReadChunkSchema.transform((value) => ({ filePath: undefined, content: flattenReadContent(value) })),
  z.array(StandardReadChunkSchema).transform((value) => ({ filePath: undefined, content: flattenReadContent(value) })),
  CodexReadPayloadSchema.transform((value) => ({
    filePath: undefined,
    content:
      flattenReadContent(value.content) ??
      flattenReadContent(value.text) ??
      flattenReadContent(value.output),
  })),
  z
    .object({ data: CodexReadPayloadSchema })
    .passthrough()
    .transform((value) => ({
      filePath: undefined,
      content:
        flattenReadContent(value.data.content) ??
        flattenReadContent(value.data.text) ??
        flattenReadContent(value.data.output),
    })),
  z
    .object({ structuredContent: CodexReadPayloadSchema })
    .passthrough()
    .transform((value) => ({
      filePath: undefined,
      content:
        flattenReadContent(value.structuredContent.content) ??
        flattenReadContent(value.structuredContent.text) ??
        flattenReadContent(value.structuredContent.output),
    })),
  z
    .object({ structured_content: CodexReadPayloadSchema })
    .passthrough()
    .transform((value) => ({
      filePath: undefined,
      content:
        flattenReadContent(value.structured_content.content) ??
        flattenReadContent(value.structured_content.text) ??
        flattenReadContent(value.structured_content.output),
    })),
  CodexReadResultWithPathSchema,
]);


const CodexCommandExecutionItemSchema = z
  .object({
    type: z.literal("commandExecution"),
    id: z.string().optional(),
    status: z.string().optional(),
    error: z.unknown().optional(),
    command: CommandValueSchema.optional(),
    cwd: z.string().optional(),
    aggregatedOutput: z.string().optional(),
    exitCode: z.number().nullable().optional(),
  })
  .passthrough();

const CodexFileChangeItemSchema = z
  .object({
    type: z.literal("fileChange"),
    id: z.string().optional(),
    status: z.string().optional(),
    error: z.unknown().optional(),
    changes: z
      .array(
        z
          .object({
            path: z.string().optional(),
            kind: z.string().optional(),
            diff: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

const CodexMcpToolCallItemSchema = z
  .object({
    type: z.literal("mcpToolCall"),
    id: z.string().optional(),
    callID: z.string().optional(),
    call_id: z.string().optional(),
    status: z.string().optional(),
    error: z.unknown().optional(),
    tool: z.string().optional(),
    server: z.string().optional(),
    arguments: z.unknown().optional(),
    result: z.unknown().optional(),
  })
  .passthrough();

const CodexWebSearchItemSchema = z
  .object({
    type: z.literal("webSearch"),
    id: z.string().optional(),
    status: z.string().optional(),
    error: z.unknown().optional(),
    query: z.string().optional(),
    action: z.unknown().optional(),
  })
  .passthrough();

const CodexThreadItemSchema = z.discriminatedUnion("type", [
  CodexCommandExecutionItemSchema,
  CodexFileChangeItemSchema,
  CodexMcpToolCallItemSchema,
  CodexWebSearchItemSchema,
]);

function flattenReadContent(
  value: z.infer<typeof CodexReadContentSchema> | undefined
): string | undefined {
  return flattenToolReadContent(value);
}

function coerceCallId(raw: string | null | undefined, name: string, input: unknown): string {
  return coerceToolCallId({
    providerPrefix: "codex",
    rawCallId: raw,
    toolName: name,
    input,
  });
}

function normalizeCodexFilePath(filePath: string | undefined, cwd: string | null | undefined): string | undefined {
  if (typeof filePath !== "string") {
    return undefined;
  }
  const trimmed = filePath.trim();
  if (!trimmed) {
    return undefined;
  }
  if (typeof cwd === "string" && cwd.length > 0) {
    const prefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length) || ".";
    }
  }
  return trimmed;
}

function resolveStatus(rawStatus: string | undefined, error: unknown, output: unknown): ToolCallTimelineItem["status"] {
  if (error !== undefined && error !== null) {
    return "failed";
  }

  if (typeof rawStatus === "string") {
    const normalized = rawStatus.trim().toLowerCase();
    if (normalized.length > 0) {
      if (FAILED_STATUSES.has(normalized)) {
        return "failed";
      }
      if (CANCELED_STATUSES.has(normalized)) {
        return "canceled";
      }
      if (COMPLETED_STATUSES.has(normalized)) {
        return "completed";
      }
      return "running";
    }
  }

  return output !== null && output !== undefined ? "completed" : "running";
}

function toShellDetail(
  input: z.infer<typeof CodexShellInputSchema> | null,
  output: z.infer<typeof CodexShellOutputSchema> | null
): ToolCallDetail | undefined {
  return toStandardShellDetail(input, output);
}

function toReadDetail(
  input: z.infer<typeof CodexReadArgumentsSchema> | null,
  output: z.infer<typeof CodexReadResultSchema> | null,
  cwd: string | null | undefined
): ToolCallDetail | undefined {
  const filePath = normalizeCodexFilePath(input?.filePath ?? output?.filePath, cwd);
  if (!filePath) {
    return undefined;
  }

  return {
    type: "read",
    filePath,
    ...(output?.content ? { content: output.content } : {}),
    ...(input?.offset !== undefined ? { offset: input.offset } : {}),
    ...(input?.limit !== undefined ? { limit: input.limit } : {}),
  };
}

function toWriteDetail(
  input: z.infer<typeof CodexWriteArgumentsSchema> | null,
  output: z.infer<typeof CodexWriteResultSchema> | null,
  cwd: string | null | undefined
): ToolCallDetail | undefined {
  return toStandardWriteDetail(input, output, (filePath) => normalizeCodexFilePath(filePath, cwd));
}

function toEditDetail(
  input: z.infer<typeof CodexEditArgumentsSchema> | null,
  output: z.infer<typeof CodexEditResultSchema> | null,
  cwd: string | null | undefined
): ToolCallDetail | undefined {
  return toStandardEditDetail(input, output, (filePath) => normalizeCodexFilePath(filePath, cwd));
}

function toSearchDetail(input: z.infer<typeof CodexSearchArgumentsSchema> | null): ToolCallDetail | undefined {
  return toStandardSearchDetail(input);
}

function codexMcpToolBranch<ToolName extends string, InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny>(
  tool: ToolName,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mapper: (
    input: z.infer<InputSchema> | null,
    output: z.infer<OutputSchema> | null,
    cwd: string | null | undefined
  ) => ToolCallDetail | undefined
) {
  return z
    .object({
      tool: z.literal(tool),
      arguments: inputSchema.nullable(),
      result: outputSchema.nullable(),
      cwd: z.string().optional().nullable(),
    })
    .transform(({ arguments: input, result: output, cwd }) => mapper(input, output, cwd));
}

const CodexKnownMcpToolDetailSchema: z.ZodType<ToolCallDetail | undefined> = unionToolDetailSchemas([
  ...CODEX_MCP_KNOWN_TOOL_ALIASES.shell.map((tool) =>
    codexMcpToolBranch(tool, CodexShellInputSchema, CodexShellOutputSchema, (input, output) =>
      toShellDetail(input, output)
    )
  ),
  ...CODEX_MCP_KNOWN_TOOL_ALIASES.read.map((tool) =>
    codexMcpToolBranch(tool, CodexReadArgumentsSchema, CodexReadResultSchema, toReadDetail)
  ),
  ...CODEX_MCP_KNOWN_TOOL_ALIASES.write.map((tool) =>
    codexMcpToolBranch(tool, CodexWriteArgumentsSchema, CodexWriteResultSchema, toWriteDetail)
  ),
  ...CODEX_MCP_KNOWN_TOOL_ALIASES.edit.map((tool) =>
    codexMcpToolBranch(tool, CodexEditArgumentsSchema, CodexEditResultSchema, toEditDetail)
  ),
  ...CODEX_MCP_KNOWN_TOOL_ALIASES.search.map((tool) =>
    codexMcpToolBranch(tool, CodexSearchArgumentsSchema, z.unknown(), (input) => toSearchDetail(input))
  ),
]);

function codexRolloutToolBranch<Name extends string, InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny>(
  name: Name,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mapper: (
    input: z.infer<InputSchema> | null,
    output: z.infer<OutputSchema> | null
  ) => ToolCallDetail | undefined
) {
  return z
    .object({
      name: z.literal(name),
      input: inputSchema.nullable(),
      output: outputSchema.nullable(),
    })
    .transform(({ input, output }) => mapper(input, output));
}

const CodexKnownRolloutDetailSchema: z.ZodType<ToolCallDetail | undefined> = unionToolDetailSchemas([
  ...CODEX_ROLLOUT_KNOWN_TOOL_ALIASES.shell.map((name) =>
    codexRolloutToolBranch(name, CodexShellInputSchema, CodexShellOutputSchema, (input, output) =>
      toShellDetail(input, output)
    )
  ),
  ...CODEX_ROLLOUT_KNOWN_TOOL_ALIASES.read.map((name) =>
    codexRolloutToolBranch(name, CodexReadArgumentsSchema, CodexReadResultSchema, (input, output) =>
      toReadDetail(input, output, null)
    )
  ),
  ...CODEX_ROLLOUT_KNOWN_TOOL_ALIASES.write.map((name) =>
    codexRolloutToolBranch(name, CodexWriteArgumentsSchema, CodexWriteResultSchema, (input, output) =>
      toWriteDetail(input, output, null)
    )
  ),
  ...CODEX_ROLLOUT_KNOWN_TOOL_ALIASES.edit.map((name) =>
    codexRolloutToolBranch(name, CodexEditArgumentsSchema, CodexEditResultSchema, (input, output) =>
      toEditDetail(input, output, null)
    )
  ),
  ...CODEX_ROLLOUT_KNOWN_TOOL_ALIASES.search.map((name) =>
    codexRolloutToolBranch(name, CodexSearchArgumentsSchema, z.unknown(), (input) => toSearchDetail(input))
  ),
]);

function deriveMcpToolDetail(
  tool: string,
  input: unknown,
  output: unknown,
  options?: CodexMapperOptions
): ToolCallDetail | undefined {
  const parsed = CodexKnownMcpToolDetailSchema.safeParse({
    tool,
    arguments: input,
    result: output,
    cwd: options?.cwd ?? null,
  });
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data;
}

function deriveRolloutDetail(name: string, input: unknown, output: unknown): ToolCallDetail | undefined {
  const parsed = CodexKnownRolloutDetailSchema.safeParse({
    name,
    input,
    output,
  });
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data;
}

function buildToolCall(params: {
  callId: string;
  name: string;
  status: ToolCallTimelineItem["status"];
  input: unknown | null;
  output: unknown | null;
  error: unknown | null;
  detail?: ToolCallDetail;
  metadata?: Record<string, unknown>;
}): ToolCallTimelineItem {
  if (params.status === "failed") {
    return {
      type: "tool_call",
      callId: params.callId,
      name: params.name,
      status: "failed",
      input: params.input,
      output: params.output,
      error: params.error ?? { message: "Tool call failed" },
      ...(params.detail ? { detail: params.detail } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    };
  }

  return {
    type: "tool_call",
    callId: params.callId,
    name: params.name,
    status: params.status,
    input: params.input,
    output: params.output,
    error: null,
    ...(params.detail ? { detail: params.detail } : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
  };
}

const CODEX_BUILTIN_TOOL_NAMES = new Set(
  Object.values(CODEX_MCP_KNOWN_TOOL_ALIASES).flat()
);

function buildMcpToolName(server: string | undefined, tool: string): string {
  const trimmedTool = tool.trim();
  if (!trimmedTool) {
    return "tool";
  }

  if (CODEX_BUILTIN_TOOL_NAMES.has(trimmedTool)) {
    return trimmedTool;
  }

  const trimmedServer = typeof server === "string" ? server.trim() : "";
  if (trimmedServer.length > 0) {
    return `${trimmedServer}.${trimmedTool}`;
  }

  return trimmedTool;
}

function toNullableObject(value: Record<string, unknown>): Record<string, unknown> | null {
  return Object.keys(value).length > 0 ? value : null;
}

function mapCommandExecutionItem(
  item: z.infer<typeof CodexCommandExecutionItemSchema>
): ToolCallTimelineItem {
  const command = item.command ? commandFromValue(item.command) : undefined;
  const input = toNullableObject({
    ...(command !== undefined ? { command } : {}),
    ...(item.cwd !== undefined ? { cwd: item.cwd } : {}),
  });

  const output =
    item.aggregatedOutput !== undefined || item.exitCode !== undefined
      ? {
          ...(command !== undefined ? { command } : {}),
          ...(item.aggregatedOutput !== undefined ? { output: item.aggregatedOutput } : {}),
          ...(item.exitCode !== undefined ? { exitCode: item.exitCode } : {}),
        }
      : null;

  const detail = command
    ? {
        type: "shell" as const,
        command,
        ...(item.cwd ? { cwd: item.cwd } : {}),
        ...(item.aggregatedOutput ? { output: item.aggregatedOutput } : {}),
        ...(item.exitCode !== undefined ? { exitCode: item.exitCode } : {}),
      }
    : undefined;

  const name = "shell";
  const callId = coerceCallId(item.id, name, input);
  const error = item.error ?? null;
  const status = resolveStatus(item.status, error, output);

  return buildToolCall({
    callId,
    name,
    status,
    input,
    output,
    error,
    ...(detail ? { detail } : {}),
  });
}

function mapFileChangeItem(
  item: z.infer<typeof CodexFileChangeItemSchema>,
  options?: CodexMapperOptions
): ToolCallTimelineItem {
  const changes = item.changes ?? [];

  const files = changes
    .map((change) => ({
      path: normalizeCodexFilePath(change.path, options?.cwd),
      kind: change.kind,
      diff: change.diff,
    }))
    .filter((change) => change.path !== undefined);

  const input = toNullableObject({
    ...(files.length > 0
      ? {
          files: files.map((file) => ({
            path: file.path,
            ...(file.kind !== undefined ? { kind: file.kind } : {}),
          })),
        }
      : {}),
  });

  const output = toNullableObject({
    ...(files.length > 0
      ? {
          files: files.map((file) => ({
            path: file.path,
            ...(file.kind !== undefined ? { kind: file.kind } : {}),
            ...(file.diff !== undefined ? { patch: truncateDiffText(file.diff) } : {}),
          })),
        }
      : {}),
  });

  const firstFile = files[0];
  const detail = firstFile?.path
    ? {
        type: "edit" as const,
        filePath: firstFile.path,
        ...(firstFile.diff !== undefined ? { unifiedDiff: truncateDiffText(firstFile.diff) } : {}),
      }
    : undefined;

  const name = "apply_patch";
  const callId = coerceCallId(item.id, name, input);
  const error = item.error ?? null;
  const status = resolveStatus(item.status, error, output);

  return buildToolCall({
    callId,
    name,
    status,
    input,
    output,
    error,
    ...(detail ? { detail } : {}),
  });
}

function mapMcpToolCallItem(
  item: z.infer<typeof CodexMcpToolCallItemSchema>,
  options?: CodexMapperOptions
): ToolCallTimelineItem {
  const tool = item.tool?.trim() || "tool";
  const name = buildMcpToolName(item.server, tool);
  const input = item.arguments ?? null;
  const output = item.result ?? null;
  const error = item.error ?? null;
  const callId = coerceCallId(item.id ?? item.callID ?? item.call_id, name, input);
  const status = resolveStatus(item.status, error, output);
  const detail = deriveMcpToolDetail(tool, input, output, options);

  return buildToolCall({
    callId,
    name,
    status,
    input,
    output,
    error,
    ...(detail ? { detail } : {}),
  });
}

function mapWebSearchItem(item: z.infer<typeof CodexWebSearchItemSchema>): ToolCallTimelineItem {
  const input = item.query !== undefined ? { query: item.query } : null;
  const output = item.action ?? null;
  const name = "web_search";
  const callId = coerceCallId(item.id, name, input);
  const error = item.error ?? null;
  const status = resolveStatus(item.status ?? "completed", error, output);
  const detail = item.query
    ? {
        type: "search" as const,
        query: item.query,
      }
    : undefined;

  return buildToolCall({
    callId,
    name,
    status,
    input,
    output,
    error,
    ...(detail ? { detail } : {}),
  });
}

function createCodexThreadItemToTimelineSchema(options?: CodexMapperOptions) {
  return CodexThreadItemSchema.transform((item): ToolCallTimelineItem => {
    switch (item.type) {
      case "commandExecution":
        return mapCommandExecutionItem(item);
      case "fileChange":
        return mapFileChangeItem(item, options);
      case "mcpToolCall":
        return mapMcpToolCallItem(item, options);
      case "webSearch":
        return mapWebSearchItem(item);
      default: {
        const exhaustiveCheck: never = item;
        throw new Error(`Unhandled Codex thread item type: ${String(exhaustiveCheck)}`);
      }
    }
  });
}

export function mapCodexToolCallFromThreadItem(
  item: unknown,
  options?: CodexMapperOptions
): ToolCallTimelineItem | null {
  const parsed = createCodexThreadItemToTimelineSchema(options).safeParse(item);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

export function mapCodexRolloutToolCall(params: {
  callId?: string | null;
  name: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
}): ToolCallTimelineItem {
  const parsed = CodexRolloutToolCallParamsSchema.parse(params);
  const input = parsed.input ?? null;
  const output = parsed.output ?? null;
  const error = parsed.error ?? null;
  const status = resolveStatus("completed", error, output);
  const callId = coerceCallId(parsed.callId, parsed.name, input);
  const detail = deriveRolloutDetail(parsed.name, input, output);

  return buildToolCall({
    callId,
    name: parsed.name,
    status,
    input,
    output,
    error,
    ...(detail ? { detail } : {}),
  });
}
