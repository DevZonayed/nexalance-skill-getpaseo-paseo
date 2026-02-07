import stripAnsi from "strip-ansi";
import { z } from "zod";

// ---- Tool Call Kind (icon category) ----

export type ToolCallKind = "read" | "edit" | "execute" | "search" | "thinking" | "agent" | "tool";

const TOOL_KIND_MAP: Record<string, ToolCallKind> = {
  read: "read",
  read_file: "read",
  edit: "edit",
  write: "edit",
  apply_patch: "edit",
  bash: "execute",
  shell: "execute",
  grep: "search",
  glob: "search",
  web_search: "search",
  thinking: "thinking",
  task: "agent",
};

// ---- Tool Name Normalization ----

const TOOL_NAME_MAP: Record<string, string> = {
  shell: "Shell",
  Bash: "Shell",
  read_file: "Read",
  apply_patch: "Edit",
  paseo_worktree_setup: "Setup",
  thinking: "Thinking",
};

const TOOL_TOKEN_REGEX = /[a-z0-9]+/g;

export function normalizeToolDisplayName(toolName: string): string {
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) {
    return toolName;
  }

  const tokens = normalized.match(TOOL_TOKEN_REGEX) ?? [];
  const leaf = tokens[tokens.length - 1];
  if (leaf === "speak") {
    return "Speak";
  }
  return toolName;
}

function resolveDisplayName(rawName: string): string {
  return normalizeToolDisplayName(TOOL_NAME_MAP[rawName] ?? rawName);
}

function resolveKind(rawName: string): ToolCallKind {
  const lower = rawName.trim().toLowerCase();
  if (TOOL_KIND_MAP[lower]) {
    return TOOL_KIND_MAP[lower];
  }
  // Check prefix for read variants (e.g. "read_pdf")
  if (lower.startsWith("read")) {
    return "read";
  }
  return "tool";
}

// ---- Path/Command Utilities ----

export function stripCwdPrefix(filePath: string, cwd?: string): string {
  if (!cwd || !filePath) return filePath;

  const normalizedCwd = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedPath = filePath.replace(/\\/g, "/");

  const prefix = `${normalizedCwd}/`;
  if (normalizedPath.startsWith(prefix)) {
    return normalizedPath.slice(prefix.length);
  }
  if (normalizedPath === normalizedCwd) {
    return ".";
  }
  return filePath;
}

// Strips shell wrapper prefixes like:
// - `/bin/zsh -lc cd /path && <cmd>`
// - `/bin/zsh -lc "cd /path && <cmd>"`
// This is used for display purposes to show the actual command being run.
const SHELL_WRAPPER_PREFIX_PATTERN = /^\/bin\/(?:zsh|bash|sh)\s+(?:-[a-zA-Z]+\s+)?/;
const CD_AND_PATTERN = /^cd\s+(?:"[^"]+"|'[^']+'|\S+)\s+&&\s+/;

export function stripShellWrapperPrefix(command: string): string {
  const prefixMatch = command.match(SHELL_WRAPPER_PREFIX_PATTERN);
  if (!prefixMatch) {
    return command;
  }

  let rest = command.slice(prefixMatch[0].length).trim();
  if (rest.length >= 2) {
    const first = rest[0];
    const last = rest[rest.length - 1];
    if ((first === `"` || first === `'`) && last === first) {
      rest = rest.slice(1, -1);
    }
  }

  return rest.replace(CD_AND_PATTERN, "");
}

// ---- Summary Schema (was PrincipalParamSchema) ----

const FileEntrySchema = z.object({ path: z.string() });

const TodoEntrySchema = z.object({
  content: z.string(),
  status: z.enum(["pending", "in_progress", "completed"]),
  activeForm: z.string().optional(),
});

const SummarySchema = z.union([
  // Sub-agent activity (from tool call metadata, highest priority)
  z.object({ subAgentActivity: z.string() }).transform((d) => ({ type: "text" as const, value: d.subAgentActivity })),
  // Direct path keys
  z.object({ file_path: z.string() }).transform((d) => ({ type: "path" as const, value: d.file_path })),
  z.object({ filePath: z.string() }).transform((d) => ({ type: "path" as const, value: d.filePath })),
  z.object({ path: z.string() }).transform((d) => ({ type: "path" as const, value: d.path })),
  // Command as string
  z.object({ command: z.string() }).transform((d) => ({ type: "command" as const, value: d.command })),
  // Command as array (Codex sends this)
  z.object({ command: z.array(z.string()).nonempty() }).transform((d) => ({ type: "command" as const, value: d.command.join(" ") })),
  // Task tool description (short summary)
  z.object({ description: z.string() }).transform((d) => ({ type: "text" as const, value: d.description })),
  // Other text params
  z.object({ title: z.string() }).transform((d) => ({ type: "text" as const, value: d.title })),
  z.object({ name: z.string() }).transform((d) => ({ type: "text" as const, value: d.name })),
  z.object({ branch: z.string() }).transform((d) => ({ type: "text" as const, value: d.branch })),
  z.object({ pattern: z.string() }).transform((d) => ({ type: "text" as const, value: d.pattern })),
  z.object({ query: z.string() }).transform((d) => ({ type: "text" as const, value: d.query })),
  z.object({ url: z.string() }).transform((d) => ({ type: "text" as const, value: d.url })),
  z.object({ text: z.string() }).transform((d) => ({ type: "text" as const, value: d.text })),
  // Files array (Codex apply_patch)
  z.object({ files: z.array(FileEntrySchema).nonempty() }).transform((d) => ({ type: "path" as const, value: d.files[0].path })),
  // TodoWrite - show in_progress item or count
  z.object({ todos: z.array(TodoEntrySchema).nonempty() }).transform((d) => {
    const inProgress = d.todos.find((t) => t.status === "in_progress");
    if (inProgress) {
      return { type: "text" as const, value: inProgress.activeForm ?? inProgress.content };
    }
    return { type: "text" as const, value: `${d.todos.length} tasks` };
  }),
]);

const RecordSchema = z.record(z.unknown());

function extractSummary(input: unknown, metadata: Record<string, unknown> | undefined, cwd: string | undefined): string | undefined {
  // Merge input + metadata into one object for the summary schema to match against.
  // metadata fields take priority (e.g. subAgentActivity overrides input fields).
  const inputRecord = RecordSchema.safeParse(input);
  const merged = metadata
    ? { ...(inputRecord.success ? inputRecord.data : {}), ...metadata }
    : inputRecord.success ? inputRecord.data : undefined;

  if (!merged) {
    return undefined;
  }

  const parsed = SummarySchema.safeParse(merged);
  if (!parsed.success) {
    return undefined;
  }

  const { type, value } = parsed.data;
  if (type === "path") {
    return stripCwdPrefix(value, cwd);
  }
  if (type === "command") {
    return stripShellWrapperPrefix(value);
  }
  return value;
}

// ---- Detail Schemas ----

export interface KeyValuePair {
  key: string;
  value: string;
}

function stringifyValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (value === "") {
    return "";
  }
  const str = z.string().safeParse(value);
  if (str.success) {
    return str.data;
  }
  const num = z.number().safeParse(value);
  if (num.success) {
    return String(num.data);
  }
  const bool = z.boolean().safeParse(value);
  if (bool.success) {
    return String(bool.data);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const KeyValuePairsSchema = z.record(z.unknown()).transform((data) =>
  Object.entries(data).map(([key, value]) => ({
    key,
    value: stringifyValue(value),
  }))
);

// Shell input: { command: "pwd", description?: "..." }
const ShellInputSchema = z.object({
  command: z.union([z.string(), z.array(z.string())]),
}).passthrough();

// Shell result (when completed): { type: "command", command: "pwd", output: "..." }
const ShellResultSchema = z.object({
  type: z.literal("command"),
  output: z.string(),
}).passthrough();

// Shell error result: { type: "tool_result", content: "Exit code 128\n...", is_error: true }
const ShellErrorResultSchema = z.object({
  type: z.literal("tool_result"),
  content: z.string(),
  is_error: z.literal(true),
}).passthrough();

const ShellToolCallSchema = z
  .object({
    input: ShellInputSchema,
    output: z.unknown(),
  })
  .transform((data) => {
    const commandRaw = Array.isArray(data.input.command)
      ? data.input.command.join(" ")
      : data.input.command;
    const command = stripShellWrapperPrefix(commandRaw);

    const resultParsed = ShellResultSchema.safeParse(data.output);
    if (resultParsed.success) {
      return {
        type: "shell" as const,
        command,
        output: stripAnsi(resultParsed.data.output),
      };
    }

    const errorParsed = ShellErrorResultSchema.safeParse(data.output);
    if (errorParsed.success) {
      return {
        type: "shell" as const,
        command,
        output: stripAnsi(errorParsed.data.content),
      };
    }

    return {
      type: "shell" as const,
      command,
      output: "",
    };
  });

// Edit input: { file_path: string, old_string: string, new_string: string }
const EditInputSchema = z.union([
  z.object({
    file_path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
  }).passthrough(),
  z.object({
    file_path: z.string(),
    old_str: z.string(),
    new_str: z.string(),
  }).passthrough(),
]);

const EditToolCallSchema = z
  .object({
    input: EditInputSchema,
    output: z.unknown(),
  })
  .transform((data): { type: "edit"; filePath: string; oldString: string; newString: string; unifiedDiff?: string } => {
    const filePath = data.input.file_path;
    const oldString = "old_string" in data.input
      ? (data.input as { old_string: string }).old_string
      : (data.input as { old_str: string }).old_str;
    const newString = "new_string" in data.input
      ? (data.input as { new_string: string }).new_string
      : (data.input as { new_str: string }).new_str;

    return {
      type: "edit",
      filePath,
      oldString,
      newString,
    };
  });

// Codex apply_patch
const ApplyPatchFileKindSchema = z
  .union([
    z.string(),
    z.object({
      type: z.string().optional(),
      move_path: z.string().nullable().optional(),
      movePath: z.string().nullable().optional(),
    }).passthrough(),
  ])
  .optional();

const ApplyPatchMovePathSchema = z.object({
  movePath: z.string().optional(),
  move_path: z.string().optional(),
}).passthrough();

function getApplyPatchMovePath(kind: unknown): string | undefined {
  const parsed = ApplyPatchMovePathSchema.safeParse(kind);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data.movePath ?? parsed.data.move_path ?? undefined;
}

const ApplyPatchInputSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    kind: ApplyPatchFileKindSchema,
  })).min(1),
}).passthrough();

const ApplyPatchResultSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    patch: z.string().optional(),
    kind: ApplyPatchFileKindSchema,
  })).optional(),
  message: z.string().optional(),
  success: z.boolean().optional(),
}).passthrough();

const ApplyPatchToolCallSchema = z
  .object({
    input: ApplyPatchInputSchema,
    output: z.unknown(),
  })
  .transform((data): { type: "edit"; filePath: string; oldString: string; newString: string; unifiedDiff?: string } => {
    const firstFile = data.input.files[0];
    const movePath = getApplyPatchMovePath(firstFile.kind);
    const filePath = movePath ?? firstFile.path;

    const resultParsed = ApplyPatchResultSchema.safeParse(data.output);
    let unifiedDiff: string | undefined;
    if (resultParsed.success && resultParsed.data.files) {
      const matchPaths = new Set<string>([firstFile.path]);
      if (movePath) matchPaths.add(movePath);

      const resultFile =
        resultParsed.data.files.find((f) => matchPaths.has(f.path)) ??
        resultParsed.data.files[0];
      unifiedDiff = resultFile?.patch;
    }

    return {
      type: "edit",
      filePath,
      oldString: "",
      newString: "",
      unifiedDiff,
    };
  });

// Read (Claude): { file_path: string, offset?: number, limit?: number }
const ReadInputSchema = z.object({
  file_path: z.string(),
  offset: z.number().optional(),
  limit: z.number().optional(),
}).passthrough();

const ReadResultSchema = z.object({
  type: z.literal("file_read"),
  filePath: z.string(),
  content: z.string(),
}).passthrough();

const ReadToolCallSchema = z
  .object({
    input: ReadInputSchema,
    output: ReadResultSchema,
  })
  .transform((data): { type: "read"; filePath: string; content: string; offset?: number; limit?: number } => ({
    type: "read",
    filePath: data.input.file_path,
    content: data.output.content,
    offset: data.input.offset,
    limit: data.input.limit,
  }));

// Codex read_file: { path: string }
const CodexReadInputSchema = z.object({
  path: z.string(),
}).passthrough();

const CodexReadResultSchema = z.object({
  type: z.literal("read_file"),
  path: z.string(),
  content: z.string(),
}).passthrough();

const CodexReadToolCallSchema = z
  .object({
    input: CodexReadInputSchema,
    output: CodexReadResultSchema,
  })
  .transform((data): { type: "read"; filePath: string; content: string; offset?: number; limit?: number } => ({
    type: "read",
    filePath: data.input.path,
    content: data.output.content,
  }));

// Thinking: input is the thinking text content
const ThinkingInputSchema = z.string();

const ThinkingToolCallSchema = z
  .object({
    input: ThinkingInputSchema,
  })
  .transform((data) => ({
    type: "thinking" as const,
    content: data.input,
  }));

// Generic tool call (fallback)
const GenericToolCallSchema = z
  .object({
    input: z.unknown(),
    output: z.unknown(),
  })
  .transform((data) => {
    const inputPairs = KeyValuePairsSchema.safeParse(data.input);
    const outputPairs = KeyValuePairsSchema.safeParse(data.output);

    return {
      type: "generic" as const,
      input: inputPairs.success ? inputPairs.data : [],
      output: outputPairs.success ? outputPairs.data : [],
    };
  });

// ---- Detail type ----

export type ToolCallDetail =
  | { type: "shell"; command: string; output: string }
  | { type: "edit"; filePath: string; oldString: string; newString: string; unifiedDiff?: string }
  | { type: "read"; filePath: string; content: string; offset?: number; limit?: number }
  | { type: "thinking"; content: string }
  | { type: "generic"; input: KeyValuePair[]; output: KeyValuePair[] };

function parseDetail(toolName: string, input: unknown, output: unknown): ToolCallDetail {
  // Thinking is matched by tool name since input is a string, not an object
  if (toolName === "thinking") {
    const thinkingParsed = ThinkingToolCallSchema.safeParse({ input });
    if (thinkingParsed.success) {
      return thinkingParsed.data;
    }
    return { type: "thinking", content: "" };
  }

  const shellParsed = ShellToolCallSchema.safeParse({ input, output });
  if (shellParsed.success) {
    return shellParsed.data;
  }

  const editParsed = EditToolCallSchema.safeParse({ input, output });
  if (editParsed.success) {
    return editParsed.data;
  }

  const applyPatchParsed = ApplyPatchToolCallSchema.safeParse({ input, output });
  if (applyPatchParsed.success) {
    return applyPatchParsed.data;
  }

  const readParsed = ReadToolCallSchema.safeParse({ input, output });
  if (readParsed.success) {
    return readParsed.data;
  }

  const codexReadParsed = CodexReadToolCallSchema.safeParse({ input, output });
  if (codexReadParsed.success) {
    return codexReadParsed.data;
  }

  const genericParsed = GenericToolCallSchema.parse({ input, output });
  return genericParsed;
}

// ---- Error formatting ----

const ToolResultErrorSchema = z.object({
  type: z.literal("tool_result"),
  content: z.string(),
}).passthrough();

function formatError(error: unknown): string | undefined {
  if (error === undefined || error === null) {
    return undefined;
  }

  const str = z.string().safeParse(error);
  if (str.success) {
    return str.data;
  }

  const toolResult = ToolResultErrorSchema.safeParse(error);
  if (toolResult.success) {
    return toolResult.data.content;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

// ---- Unified ToolCallDisplayInfo ----

export interface ToolCallInput {
  name: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
  cwd?: string;
}

export interface ToolCallDisplayInfo {
  displayName: string;
  kind: ToolCallKind;
  summary?: string;
  detail: ToolCallDetail;
  errorText?: string;
}

export function parseToolCallDisplay(toolCall: ToolCallInput): ToolCallDisplayInfo {
  const displayName = resolveDisplayName(toolCall.name);
  const kind = resolveKind(toolCall.name);
  const summary = extractSummary(toolCall.input, toolCall.metadata, toolCall.cwd);
  const detail = parseDetail(toolCall.name, toolCall.input, toolCall.output);
  const errorText = formatError(toolCall.error);

  return {
    displayName,
    kind,
    summary,
    detail,
    errorText,
  };
}

// ---- TodoWrite Extraction ----

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

export function extractTodos(value: unknown): TodoItem[] {
  const parsed = z.object({
    todos: z.array(z.object({
      content: z.string(),
      status: z.enum(["pending", "in_progress", "completed"]),
      activeForm: z.string().optional(),
    })),
  }).safeParse(value);

  if (!parsed.success) {
    return [];
  }

  return parsed.data.todos;
}
