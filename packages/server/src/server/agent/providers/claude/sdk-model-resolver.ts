import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";

import type { AgentModelDefinition, AgentSelectOption } from "../../agent-sdk-types.js";

type ParsedClaudeSdkModelDescriptor = {
  family: "opus" | "sonnet" | "haiku";
  version: string;
};

// Claude may advertise effort levels that are not usable for all account types.
const DISABLED_CLAUDE_THINKING_EFFORT_LEVELS: readonly string[] = ["max"];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function normalizeClaudeVersionId(version: string): string {
  return version.replace(/\./g, "-");
}

function buildClaudeModelId(parsed: ParsedClaudeSdkModelDescriptor): string {
  return `claude-${parsed.family}-${normalizeClaudeVersionId(parsed.version)}`;
}

function parseClaudeSdkDescriptor(model: ModelInfo): ParsedClaudeSdkModelDescriptor | null {
  const description = normalizeWhitespace(model.description ?? "");
  if (!description) {
    return null;
  }

  const match = description.match(/\b(opus|sonnet|haiku)\s+(\d+(?:\.\d+)*)\b/i);
  if (!match) {
    return null;
  }

  const family = match[1].toLowerCase() as ParsedClaudeSdkModelDescriptor["family"];
  const version = match[2]!;
  return { family, version };
}

export function normalizeClaudeModelIdFromText(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) {
    return null;
  }

  const runtimeMatch = normalized.match(/\b(opus|sonnet|haiku)[-_ ]+(\d+(?:[-.]\d+)*)\b/i);
  if (!runtimeMatch) {
    return null;
  }

  const family = runtimeMatch[1]!.toLowerCase() as ParsedClaudeSdkModelDescriptor["family"];
  const version = runtimeMatch[2]!.replace(/-/g, ".");
  return buildClaudeModelId({ family, version });
}

function buildModelLabel(model: ModelInfo): string {
  const parsed = parseClaudeSdkDescriptor(model);
  if (!parsed) {
    return normalizeWhitespace(model.displayName || model.value);
  }
  return `${titleCase(parsed.family)} ${parsed.version}`;
}

function buildThinkingOptions(model: ModelInfo): {
  thinkingOptions?: AgentSelectOption[];
  defaultThinkingOptionId?: string;
} {
  const effortLevels = (model.supportedEffortLevels ?? []).filter(
    (level) => !DISABLED_CLAUDE_THINKING_EFFORT_LEVELS.includes(level),
  );
  if (!model.supportsEffort || effortLevels.length === 0) {
    return {};
  }

  const thinkingOptions: AgentSelectOption[] = effortLevels.map((level) => ({
    id: level,
    label: titleCase(level),
  }));

  return {
    thinkingOptions,
  };
}

export function resolveClaudeModelsFromSdkModels(models: ModelInfo[]): AgentModelDefinition[] {
  const resolved = new Map<string, AgentModelDefinition>();

  for (const model of models) {
    const thinking = buildThinkingOptions(model);
    const parsed = parseClaudeSdkDescriptor(model);
    const id = parsed ? buildClaudeModelId(parsed) : model.value;
    const existing = resolved.get(id);
    resolved.set(id, {
      provider: "claude",
      id,
      label: buildModelLabel(model),
      description: normalizeWhitespace(model.description ?? model.displayName ?? model.value),
      isDefault:
        existing?.isDefault === true || model.value.trim().toLowerCase() === "default" || undefined,
      ...(thinking.thinkingOptions || existing?.thinkingOptions
        ? { thinkingOptions: thinking.thinkingOptions ?? existing?.thinkingOptions }
        : {}),
      ...(thinking.defaultThinkingOptionId || existing?.defaultThinkingOptionId
        ? {
            defaultThinkingOptionId:
              thinking.defaultThinkingOptionId ?? existing?.defaultThinkingOptionId,
          }
        : {}),
      metadata: {
        sdkValues: Array.from(
          new Set([...(Array.isArray(existing?.metadata?.sdkValues) ? existing.metadata.sdkValues : []), model.value]),
        ),
        sdkDisplayNames: Array.from(
          new Set([
            ...(Array.isArray(existing?.metadata?.sdkDisplayNames) ? existing.metadata.sdkDisplayNames : []),
            model.displayName,
          ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0)),
        ),
        sdkDescriptions: Array.from(
          new Set([
            ...(Array.isArray(existing?.metadata?.sdkDescriptions) ? existing.metadata.sdkDescriptions : []),
            model.description,
          ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0)),
        ),
        supportsEffort: model.supportsEffort === true,
        supportedEffortLevels: model.supportedEffortLevels,
        supportsAdaptiveThinking: model.supportsAdaptiveThinking === true,
        supportsFastMode: model.supportsFastMode === true,
      },
    });
  }

  return Array.from(resolved.values());
}

export function parseClaudeSdkModelDescriptorForTest(
  model: ModelInfo,
): ParsedClaudeSdkModelDescriptor | null {
  return parseClaudeSdkDescriptor(model);
}
