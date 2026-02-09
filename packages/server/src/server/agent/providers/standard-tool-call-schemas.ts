import { z } from "zod";

import type { ToolCallDetail } from "../agent-sdk-types.js";
import {
  commandFromValue,
  flattenReadContent,
  nonEmptyString,
  truncateDiffText,
} from "./tool-call-mapper-utils.js";

export type StandardShellInput = {
  command?: string;
  cwd?: string;
};

export type StandardShellOutput = {
  command?: string;
  output?: string;
  exitCode?: number | null;
};

export type StandardReadPathInput = {
  filePath: string;
  offset?: number;
  limit?: number;
};

export type StandardReadOutput = {
  content?: string;
};

export type StandardWriteInput = {
  filePath: string;
  content?: string;
};

export type StandardWriteOutput = {
  filePath?: string;
  content?: string;
};

export type StandardEditInput = {
  filePath: string;
  oldString?: string;
  newString?: string;
  unifiedDiff?: string;
};

export type StandardEditOutput = {
  filePath?: string;
  newString?: string;
  unifiedDiff?: string;
};

export type StandardSearchInput = {
  query: string;
};

const CommandValueSchema = z.union([z.string(), z.array(z.string())]);

export const StandardShellInputSchema = z
  .union([
    z
      .object({
        command: CommandValueSchema,
        cwd: z.string().optional(),
        directory: z.string().optional(),
      })
      .passthrough(),
    z
      .object({
        cmd: CommandValueSchema,
        cwd: z.string().optional(),
        directory: z.string().optional(),
      })
      .passthrough(),
  ])
  .transform((value) => {
    const commandValue = "command" in value ? value.command : value.cmd;
    return {
      command: commandFromValue(commandValue),
      cwd: nonEmptyString(value.cwd) ?? nonEmptyString(value.directory),
    };
  });

const StandardShellOutputObjectSchema = z
  .object({
    command: z.string().optional(),
    output: z.string().optional(),
    text: z.string().optional(),
    content: z.string().optional(),
    aggregated_output: z.string().optional(),
    aggregatedOutput: z.string().optional(),
    exitCode: z.number().finite().nullable().optional(),
    exit_code: z.number().finite().nullable().optional(),
    metadata: z
      .object({
        exitCode: z.number().finite().nullable().optional(),
        exit_code: z.number().finite().nullable().optional(),
      })
      .passthrough()
      .optional(),
    structuredContent: z
      .object({
        output: z.string().optional(),
        text: z.string().optional(),
        content: z.string().optional(),
      })
      .passthrough()
      .optional(),
    structured_content: z
      .object({
        output: z.string().optional(),
        text: z.string().optional(),
        content: z.string().optional(),
      })
      .passthrough()
      .optional(),
    result: z
      .object({
        command: z.string().optional(),
        output: z.string().optional(),
        text: z.string().optional(),
        content: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const StandardShellOutputSchema = z.union([
  z.string().transform((value) => ({
    command: undefined,
    output: nonEmptyString(value),
    exitCode: undefined,
  })),
  StandardShellOutputObjectSchema.transform((value) => ({
    command: nonEmptyString(value.command) ?? nonEmptyString(value.result?.command),
    output:
      nonEmptyString(value.output) ??
      nonEmptyString(value.text) ??
      nonEmptyString(value.content) ??
      nonEmptyString(value.aggregated_output) ??
      nonEmptyString(value.aggregatedOutput) ??
      nonEmptyString(value.structuredContent?.output) ??
      nonEmptyString(value.structuredContent?.text) ??
      nonEmptyString(value.structuredContent?.content) ??
      nonEmptyString(value.structured_content?.output) ??
      nonEmptyString(value.structured_content?.text) ??
      nonEmptyString(value.structured_content?.content) ??
      nonEmptyString(value.result?.output) ??
      nonEmptyString(value.result?.text) ??
      nonEmptyString(value.result?.content),
    exitCode:
      value.exitCode ??
      value.exit_code ??
      value.metadata?.exitCode ??
      value.metadata?.exit_code ??
      undefined,
  })),
]);

const StandardPathSchema = z.union([
  z.object({ file_path: z.string() }).passthrough().transform((value) => ({ filePath: value.file_path })),
  z.object({ path: z.string() }).passthrough().transform((value) => ({ filePath: value.path })),
  z.object({ filePath: z.string() }).passthrough().transform((value) => ({ filePath: value.filePath })),
]);

export const StandardReadPathInputSchema = z.union([
  z
    .object({
      file_path: z.string(),
      offset: z.number().finite().optional(),
      limit: z.number().finite().optional(),
    })
    .passthrough()
    .transform((value) => ({
      filePath: value.file_path,
      offset: value.offset,
      limit: value.limit,
    })),
  z
    .object({
      path: z.string(),
      offset: z.number().finite().optional(),
      limit: z.number().finite().optional(),
    })
    .passthrough()
    .transform((value) => ({
      filePath: value.path,
      offset: value.offset,
      limit: value.limit,
    })),
  z
    .object({
      filePath: z.string(),
      offset: z.number().finite().optional(),
      limit: z.number().finite().optional(),
    })
    .passthrough()
    .transform((value) => ({
      filePath: value.filePath,
      offset: value.offset,
      limit: value.limit,
    })),
]);

export const StandardReadChunkSchema = z.union([
  z
    .object({
      text: z.string(),
      content: z.string().optional(),
      output: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      text: z.string().optional(),
      content: z.string(),
      output: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      text: z.string().optional(),
      content: z.string().optional(),
      output: z.string(),
    })
    .passthrough(),
]);

const StandardReadContentSchema = z.union([
  z.string(),
  StandardReadChunkSchema,
  z.array(StandardReadChunkSchema),
]);

const StandardReadPayloadSchema = z.union([
  z
    .object({
      content: StandardReadContentSchema,
      text: StandardReadContentSchema.optional(),
      output: StandardReadContentSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      content: StandardReadContentSchema.optional(),
      text: StandardReadContentSchema,
      output: StandardReadContentSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      content: StandardReadContentSchema.optional(),
      text: StandardReadContentSchema.optional(),
      output: StandardReadContentSchema,
    })
    .passthrough(),
]);

export const StandardReadOutputSchema: z.ZodType<StandardReadOutput, z.ZodTypeDef, unknown> = z.union([
  z.string().transform((value) => ({ content: nonEmptyString(value) })),
  StandardReadChunkSchema.transform((value) => ({ content: flattenReadContent(value) })),
  z.array(StandardReadChunkSchema).transform((value) => ({ content: flattenReadContent(value) })),
  StandardReadPayloadSchema.transform((value) => ({
    content:
      flattenReadContent(value.content) ??
      flattenReadContent(value.text) ??
      flattenReadContent(value.output),
  })),
  z
    .object({ data: StandardReadPayloadSchema })
    .passthrough()
    .transform((value) => ({
      content:
        flattenReadContent(value.data.content) ??
        flattenReadContent(value.data.text) ??
        flattenReadContent(value.data.output),
    })),
  z
    .object({ structuredContent: StandardReadPayloadSchema })
    .passthrough()
    .transform((value) => ({
      content:
        flattenReadContent(value.structuredContent.content) ??
        flattenReadContent(value.structuredContent.text) ??
        flattenReadContent(value.structuredContent.output),
    })),
  z
    .object({ structured_content: StandardReadPayloadSchema })
    .passthrough()
    .transform((value) => ({
      content:
        flattenReadContent(value.structured_content.content) ??
        flattenReadContent(value.structured_content.text) ??
        flattenReadContent(value.structured_content.output),
    })),
]);

const StandardWriteContentSchema = z
  .object({
    content: z.string().optional(),
    new_content: z.string().optional(),
    newContent: z.string().optional(),
  })
  .passthrough();

export const StandardWriteInputSchema = z
  .intersection(StandardPathSchema, StandardWriteContentSchema)
  .transform((value) => ({
    filePath: value.filePath,
    content:
      nonEmptyString(value.content) ??
      nonEmptyString(value.new_content) ??
      nonEmptyString(value.newContent),
  }));

export const StandardWriteOutputSchema = z.union([
  z
    .intersection(StandardPathSchema, StandardWriteContentSchema)
    .transform((value) => ({
      filePath: value.filePath,
      content:
        nonEmptyString(value.content) ??
        nonEmptyString(value.new_content) ??
        nonEmptyString(value.newContent),
    })),
  StandardWriteContentSchema.transform((value) => ({
    filePath: undefined,
    content:
      nonEmptyString(value.content) ??
      nonEmptyString(value.new_content) ??
      nonEmptyString(value.newContent),
  })),
]);

const StandardEditTextSchema = z
  .object({
    old_string: z.string().optional(),
    old_str: z.string().optional(),
    oldContent: z.string().optional(),
    old_content: z.string().optional(),
    new_string: z.string().optional(),
    new_str: z.string().optional(),
    newContent: z.string().optional(),
    new_content: z.string().optional(),
    content: z.string().optional(),
    patch: z.string().optional(),
    diff: z.string().optional(),
    unified_diff: z.string().optional(),
    unifiedDiff: z.string().optional(),
  })
  .passthrough();

export const StandardEditInputSchema = z
  .intersection(StandardPathSchema, StandardEditTextSchema)
  .transform((value) => ({
    filePath: value.filePath,
    oldString:
      nonEmptyString(value.old_string) ??
      nonEmptyString(value.old_str) ??
      nonEmptyString(value.oldContent) ??
      nonEmptyString(value.old_content),
    newString:
      nonEmptyString(value.new_string) ??
      nonEmptyString(value.new_str) ??
      nonEmptyString(value.newContent) ??
      nonEmptyString(value.new_content) ??
      nonEmptyString(value.content),
    unifiedDiff: truncateDiffText(
      nonEmptyString(value.patch) ??
        nonEmptyString(value.diff) ??
        nonEmptyString(value.unified_diff) ??
        nonEmptyString(value.unifiedDiff)
    ),
  }));

const StandardEditOutputFileSchema = z.union([
  z
    .object({
      path: z.string(),
      patch: z.string().optional(),
      diff: z.string().optional(),
      unified_diff: z.string().optional(),
      unifiedDiff: z.string().optional(),
    })
    .passthrough()
    .transform((value) => ({
      filePath: value.path,
      unifiedDiff: truncateDiffText(
        nonEmptyString(value.patch) ??
          nonEmptyString(value.diff) ??
          nonEmptyString(value.unified_diff) ??
          nonEmptyString(value.unifiedDiff)
      ),
    })),
  z
    .object({
      file_path: z.string(),
      patch: z.string().optional(),
      diff: z.string().optional(),
      unified_diff: z.string().optional(),
      unifiedDiff: z.string().optional(),
    })
    .passthrough()
    .transform((value) => ({
      filePath: value.file_path,
      unifiedDiff: truncateDiffText(
        nonEmptyString(value.patch) ??
          nonEmptyString(value.diff) ??
          nonEmptyString(value.unified_diff) ??
          nonEmptyString(value.unifiedDiff)
      ),
    })),
  z
    .object({
      filePath: z.string(),
      patch: z.string().optional(),
      diff: z.string().optional(),
      unified_diff: z.string().optional(),
      unifiedDiff: z.string().optional(),
    })
    .passthrough()
    .transform((value) => ({
      filePath: value.filePath,
      unifiedDiff: truncateDiffText(
        nonEmptyString(value.patch) ??
          nonEmptyString(value.diff) ??
          nonEmptyString(value.unified_diff) ??
          nonEmptyString(value.unifiedDiff)
      ),
    })),
]);

export const StandardEditOutputSchema = z.union([
  z
    .intersection(StandardPathSchema, StandardEditTextSchema)
    .transform((value) => ({
      filePath: value.filePath,
      newString:
        nonEmptyString(value.newContent) ??
        nonEmptyString(value.new_content) ??
        nonEmptyString(value.content),
      unifiedDiff: truncateDiffText(
        nonEmptyString(value.patch) ??
          nonEmptyString(value.diff) ??
          nonEmptyString(value.unified_diff) ??
          nonEmptyString(value.unifiedDiff)
      ),
    })),
  z
    .object({ files: z.array(StandardEditOutputFileSchema).min(1) })
    .passthrough()
    .transform((value) => ({
      filePath: value.files[0]?.filePath,
      unifiedDiff: value.files[0]?.unifiedDiff,
      newString: undefined,
    })),
  StandardEditTextSchema.transform((value) => ({
    filePath: undefined,
    newString:
      nonEmptyString(value.newContent) ??
      nonEmptyString(value.new_content) ??
      nonEmptyString(value.content),
    unifiedDiff: truncateDiffText(
      nonEmptyString(value.patch) ??
        nonEmptyString(value.diff) ??
        nonEmptyString(value.unified_diff) ??
        nonEmptyString(value.unifiedDiff)
    ),
  })),
]);

export const StandardSearchInputSchema = z.union([
  z.object({ query: z.string() }).passthrough().transform((value) => ({ query: value.query })),
  z.object({ q: z.string() }).passthrough().transform((value) => ({ query: value.q })),
]);

export function toStandardShellDetail(
  input: StandardShellInput | null,
  output: StandardShellOutput | null
): ToolCallDetail | undefined {
  const command = input?.command ?? output?.command;
  if (!command) {
    return undefined;
  }

  return {
    type: "shell",
    command,
    ...(input?.cwd ? { cwd: input.cwd } : {}),
    ...(output?.output ? { output: output.output } : {}),
    ...(output?.exitCode !== undefined ? { exitCode: output.exitCode } : {}),
  };
}

export function toStandardReadDetail(
  input: StandardReadPathInput | null,
  output: StandardReadOutput | null,
  normalizePath?: (filePath: string) => string | undefined
): ToolCallDetail | undefined {
  const path = input?.filePath;
  if (!path) {
    return undefined;
  }
  const filePath = normalizePath ? normalizePath(path) : path;
  if (!filePath) {
    return undefined;
  }

  return {
    type: "read",
    filePath,
    ...(output?.content ? { content: output.content } : {}),
    ...(input.offset !== undefined ? { offset: input.offset } : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  };
}

export function toStandardWriteDetail(
  input: StandardWriteInput | null,
  output: StandardWriteOutput | null,
  normalizePath?: (filePath: string) => string | undefined
): ToolCallDetail | undefined {
  const rawPath = input?.filePath ?? output?.filePath;
  if (!rawPath) {
    return undefined;
  }
  const filePath = normalizePath ? normalizePath(rawPath) : rawPath;
  if (!filePath) {
    return undefined;
  }

  return {
    type: "write",
    filePath,
    ...(input?.content ? { content: input.content } : output?.content ? { content: output.content } : {}),
  };
}

export function toStandardEditDetail(
  input: StandardEditInput | null,
  output: StandardEditOutput | null,
  normalizePath?: (filePath: string) => string | undefined
): ToolCallDetail | undefined {
  const rawPath = input?.filePath ?? output?.filePath;
  if (!rawPath) {
    return undefined;
  }
  const filePath = normalizePath ? normalizePath(rawPath) : rawPath;
  if (!filePath) {
    return undefined;
  }

  return {
    type: "edit",
    filePath,
    ...(input?.oldString ? { oldString: input.oldString } : {}),
    ...(input?.newString ? { newString: input.newString } : output?.newString ? { newString: output.newString } : {}),
    ...(input?.unifiedDiff
      ? { unifiedDiff: input.unifiedDiff }
      : output?.unifiedDiff
        ? { unifiedDiff: output.unifiedDiff }
        : {}),
  };
}

export function toStandardSearchDetail(input: StandardSearchInput | null): ToolCallDetail | undefined {
  if (!input?.query) {
    return undefined;
  }
  return {
    type: "search",
    query: input.query,
  };
}
