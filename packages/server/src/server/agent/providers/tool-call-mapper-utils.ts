import { z } from "zod";

type ReadChunkLike = {
  text?: string;
  content?: string;
  output?: string;
};

type ToolAliasKind = "shell" | "read" | "write" | "edit" | "search";
export type KnownToolAliases = Record<ToolAliasKind, readonly string[]>;

export const CLAUDE_KNOWN_TOOL_ALIASES: KnownToolAliases = {
  shell: ["Bash", "bash", "shell", "exec_command"],
  read: ["Read", "read", "read_file", "view_file"],
  write: ["Write", "write", "write_file", "create_file"],
  edit: [
    "Edit",
    "MultiEdit",
    "multi_edit",
    "edit",
    "apply_patch",
    "apply_diff",
    "str_replace_editor",
  ],
  search: ["WebSearch", "web_search", "search"],
};

export const OPENCODE_KNOWN_TOOL_ALIASES: KnownToolAliases = {
  shell: ["shell", "bash", "exec_command"],
  read: ["read", "read_file"],
  write: ["write", "write_file", "create_file"],
  edit: ["edit", "apply_patch", "apply_diff"],
  search: ["search", "web_search"],
};

export const CODEX_MCP_KNOWN_TOOL_ALIASES: KnownToolAliases = {
  shell: ["shell", "bash", "exec", "exec_command", "command"],
  read: ["read", "read_file"],
  write: ["write", "write_file", "create_file"],
  edit: ["edit", "apply_patch", "apply_diff"],
  search: ["search", "web_search"],
};

export const CODEX_ROLLOUT_KNOWN_TOOL_ALIASES: KnownToolAliases = {
  shell: ["Bash", "shell", "bash", "exec_command"],
  read: ["read", "read_file"],
  write: ["write", "write_file", "create_file"],
  edit: ["edit", "apply_patch", "apply_diff"],
  search: ["search", "web_search"],
};

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function commandFromValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return nonEmptyString(value);
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tokens = value.filter(
    (token): token is string => typeof token === "string" && token.length > 0
  );
  return tokens.length > 0 ? tokens.join(" ") : undefined;
}

export function flattenReadContent<Chunk extends ReadChunkLike>(
  value: string | Chunk | Chunk[] | undefined
): string | undefined {
  if (typeof value === "string") {
    return nonEmptyString(value);
  }
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map(
        (chunk) =>
          nonEmptyString(chunk.text) ??
          nonEmptyString(chunk.content) ??
          nonEmptyString(chunk.output)
      )
      .filter((part): part is string => typeof part === "string");
    return parts.length > 0 ? parts.join("\n") : undefined;
  }
  return (
    nonEmptyString(value.text) ??
    nonEmptyString(value.content) ??
    nonEmptyString(value.output)
  );
}

export function truncateDiffText(
  text: string | undefined,
  maxChars: number = 12_000
): string | undefined {
  if (typeof text !== "string") {
    return undefined;
  }
  if (text.length <= maxChars) {
    return text;
  }

  const truncatedCount = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n...[truncated ${truncatedCount} chars]`;
}

function hashText(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function coerceToolCallId(params: {
  providerPrefix: string;
  rawCallId: string | null | undefined;
  toolName: string;
  input: unknown;
}): string {
  if (typeof params.rawCallId === "string" && params.rawCallId.trim().length > 0) {
    return params.rawCallId;
  }

  let serialized = "";
  try {
    serialized = JSON.stringify(params.input) ?? "";
  } catch {
    serialized = String(params.input);
  }

  return `${params.providerPrefix}-${hashText(`${params.toolName}:${serialized}`)}`;
}

export function unionToolDetailSchemas(schemas: z.ZodTypeAny[]): z.ZodTypeAny {
  if (schemas.length === 0) {
    throw new Error("Expected at least one schema when building tool detail union");
  }
  let union = schemas[0];
  for (let i = 1; i < schemas.length; i += 1) {
    union = union.or(schemas[i]);
  }
  return union;
}
