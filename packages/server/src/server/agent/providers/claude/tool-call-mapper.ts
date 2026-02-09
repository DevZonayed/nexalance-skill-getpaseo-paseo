import { z } from "zod";

import type { ToolCallDetail, ToolCallTimelineItem } from "../../agent-sdk-types.js";
import {
  StandardEditInputSchema,
  StandardEditOutputSchema,
  StandardReadOutputSchema,
  StandardReadPathInputSchema,
  StandardSearchInputSchema,
  StandardShellInputSchema,
  StandardShellOutputSchema,
  StandardWriteInputSchema,
  StandardWriteOutputSchema,
  toStandardEditDetail,
  toStandardReadDetail,
  toStandardSearchDetail,
  toStandardShellDetail,
  toStandardWriteDetail,
} from "../standard-tool-call-schemas.js";
import {
  CLAUDE_KNOWN_TOOL_ALIASES,
  coerceToolCallId,
  unionToolDetailSchemas,
} from "../tool-call-mapper-utils.js";

type MapperParams = {
  callId?: string | null;
  name: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
};

const ClaudeMapperParamsSchema = z
  .object({
    callId: z.string().optional().nullable(),
    name: z.string().min(1),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

const ClaudeFailedMapperParamsSchema = ClaudeMapperParamsSchema.extend({
  error: z.unknown(),
});

function coerceCallId(callId: string | null | undefined, name: string, input: unknown): string {
  return coerceToolCallId({
    providerPrefix: "claude",
    rawCallId: callId,
    toolName: name,
    input,
  });
}

function claudeToolBranch<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny>(
  name: string,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mapper: (
    input: z.output<InputSchema> | null | undefined,
    output: z.output<OutputSchema> | null | undefined
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

const ClaudeKnownToolDetailSchema: z.ZodType<ToolCallDetail | undefined> = unionToolDetailSchemas([
  ...CLAUDE_KNOWN_TOOL_ALIASES.shell.map((name) =>
    claudeToolBranch(name, StandardShellInputSchema, StandardShellOutputSchema, (input, output) =>
      toStandardShellDetail(input ?? null, output ?? null)
    )
  ),
  ...CLAUDE_KNOWN_TOOL_ALIASES.read.map((name) =>
    claudeToolBranch(name, StandardReadPathInputSchema, StandardReadOutputSchema, (input, output) =>
      toStandardReadDetail(input ?? null, output ?? null)
    )
  ),
  ...CLAUDE_KNOWN_TOOL_ALIASES.write.map((name) =>
    claudeToolBranch(name, StandardWriteInputSchema, StandardWriteOutputSchema, (input, output) =>
      toStandardWriteDetail(input ?? null, output ?? null)
    )
  ),
  ...CLAUDE_KNOWN_TOOL_ALIASES.edit.map((name) =>
    claudeToolBranch(name, StandardEditInputSchema, StandardEditOutputSchema, (input, output) =>
      toStandardEditDetail(input ?? null, output ?? null)
    )
  ),
  ...CLAUDE_KNOWN_TOOL_ALIASES.search.map((name) =>
    claudeToolBranch(name, StandardSearchInputSchema, z.unknown(), (input) => toStandardSearchDetail(input ?? null))
  ),
]);

function deriveDetail(name: string, input: unknown, output: unknown): ToolCallDetail | undefined {
  const parsed = ClaudeKnownToolDetailSchema.safeParse({
    name,
    input,
    output,
  });
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data;
}

function buildBase(params: MapperParams): {
  callId: string;
  name: string;
  input: unknown | null;
  output: unknown | null;
  detail?: ToolCallDetail;
  metadata?: Record<string, unknown>;
} {
  const parsedParams = ClaudeMapperParamsSchema.parse(params);
  const input = parsedParams.input ?? null;
  const output = parsedParams.output ?? null;
  const detail = deriveDetail(parsedParams.name, input, output);

  return {
    callId: coerceCallId(parsedParams.callId, parsedParams.name, input),
    name: parsedParams.name,
    input,
    output,
    ...(detail ? { detail } : {}),
    ...(parsedParams.metadata ? { metadata: parsedParams.metadata } : {}),
  };
}

export function mapClaudeRunningToolCall(params: MapperParams): ToolCallTimelineItem {
  const base = buildBase(params);
  return {
    type: "tool_call",
    ...base,
    status: "running",
    error: null,
  };
}

export function mapClaudeCompletedToolCall(params: MapperParams): ToolCallTimelineItem {
  const base = buildBase(params);
  return {
    type: "tool_call",
    ...base,
    status: "completed",
    error: null,
  };
}

export function mapClaudeFailedToolCall(
  params: MapperParams & { error: unknown }
): ToolCallTimelineItem {
  const parsedParams = ClaudeFailedMapperParamsSchema.parse(params);
  const base = buildBase(parsedParams);
  return {
    type: "tool_call",
    ...base,
    status: "failed",
    error: parsedParams.error,
  };
}

export function mapClaudeCanceledToolCall(params: MapperParams): ToolCallTimelineItem {
  const base = buildBase(params);
  return {
    type: "tool_call",
    ...base,
    status: "canceled",
    error: null,
  };
}
