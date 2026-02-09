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
  coerceToolCallId,
  OPENCODE_KNOWN_TOOL_ALIASES,
  unionToolDetailSchemas,
} from "../tool-call-mapper-utils.js";

type OpencodeToolCallParams = {
  toolName: string;
  callId?: string | null;
  status?: unknown;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

const FAILED_STATUSES = new Set(["error", "failed", "failure"]);
const CANCELED_STATUSES = new Set(["canceled", "cancelled", "aborted", "interrupted"]);
const COMPLETED_STATUSES = new Set(["complete", "completed", "success", "succeeded", "done"]);

const OpencodeToolCallParamsSchema = z
  .object({
    toolName: z.string().min(1),
    callId: z.string().optional().nullable(),
    status: z.unknown().optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    error: z.unknown().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

function coerceCallId(callId: string | null | undefined, toolName: string, input: unknown): string {
  return coerceToolCallId({
    providerPrefix: "opencode",
    rawCallId: callId,
    toolName,
    input,
  });
}

function resolveStatus(rawStatus: unknown, error: unknown, output: unknown): ToolCallTimelineItem["status"] {
  if (error !== null && error !== undefined) {
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

function opencodeToolBranch<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny>(
  toolName: string,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mapper: (
    input: z.output<InputSchema> | null | undefined,
    output: z.output<OutputSchema> | null | undefined
  ) => ToolCallDetail | undefined
) {
  return z
    .object({
      toolName: z.literal(toolName),
      input: inputSchema.nullable(),
      output: outputSchema.nullable(),
    })
    .transform(({ input, output }) => mapper(input, output));
}

const OpencodeKnownToolDetailSchema: z.ZodType<ToolCallDetail | undefined> = unionToolDetailSchemas([
  ...OPENCODE_KNOWN_TOOL_ALIASES.shell.map((toolName) =>
    opencodeToolBranch(toolName, StandardShellInputSchema, StandardShellOutputSchema, (input, output) =>
      toStandardShellDetail(input ?? null, output ?? null)
    )
  ),
  ...OPENCODE_KNOWN_TOOL_ALIASES.read.map((toolName) =>
    opencodeToolBranch(toolName, StandardReadPathInputSchema, StandardReadOutputSchema, (input, output) =>
      toStandardReadDetail(input ?? null, output ?? null)
    )
  ),
  ...OPENCODE_KNOWN_TOOL_ALIASES.write.map((toolName) =>
    opencodeToolBranch(toolName, StandardWriteInputSchema, StandardWriteOutputSchema, (input, output) =>
      toStandardWriteDetail(input ?? null, output ?? null)
    )
  ),
  ...OPENCODE_KNOWN_TOOL_ALIASES.edit.map((toolName) =>
    opencodeToolBranch(toolName, StandardEditInputSchema, StandardEditOutputSchema, (input, output) =>
      toStandardEditDetail(input ?? null, output ?? null)
    )
  ),
  ...OPENCODE_KNOWN_TOOL_ALIASES.search.map((toolName) =>
    opencodeToolBranch(toolName, StandardSearchInputSchema, z.unknown(), (input) =>
      toStandardSearchDetail(input ?? null)
    )
  ),
]);

function deriveDetail(toolName: string, input: unknown, output: unknown): ToolCallDetail | undefined {
  const parsed = OpencodeKnownToolDetailSchema.safeParse({
    toolName,
    input,
    output,
  });
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data;
}

export function mapOpencodeToolCall(params: OpencodeToolCallParams): ToolCallTimelineItem {
  const parsedParams = OpencodeToolCallParamsSchema.parse(params);
  const input = parsedParams.input ?? null;
  const output = parsedParams.output ?? null;
  const status = resolveStatus(parsedParams.status, parsedParams.error, output);
  const callId = coerceCallId(parsedParams.callId, parsedParams.toolName, input);
  const detail = deriveDetail(parsedParams.toolName, input, output);

  if (status === "failed") {
    return {
      type: "tool_call",
      callId,
      name: parsedParams.toolName,
      status: "failed",
      input,
      output,
      error: parsedParams.error ?? { message: "Tool call failed" },
      ...(detail ? { detail } : {}),
      ...(parsedParams.metadata ? { metadata: parsedParams.metadata } : {}),
    };
  }

  return {
    type: "tool_call",
    callId,
    name: parsedParams.toolName,
    status,
    input,
    output,
    error: null,
    ...(detail ? { detail } : {}),
    ...(parsedParams.metadata ? { metadata: parsedParams.metadata } : {}),
  };
}
