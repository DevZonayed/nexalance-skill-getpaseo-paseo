import type { AgentModelDefinition } from "@server/server/agent/agent-sdk-types";

export type ExplainedStatusSelector = "mode" | "model" | "thinking";

export function getStatusSelectorHint(selector: ExplainedStatusSelector): string {
  switch (selector) {
    case "thinking":
      return "Thinking mode";
    case "model":
      return "Change model";
    case "mode":
      return "Change permission mode";
  }
}

export function normalizeModelId(modelId: string | null | undefined): string | null {
  const normalized = typeof modelId === "string" ? modelId.trim() : "";
  if (!normalized) {
    return null;
  }
  return normalized;
}

export function resolveAgentModelSelection(input: {
  models: AgentModelDefinition[] | null;
  runtimeModelId: string | null | undefined;
  configuredModelId: string | null | undefined;
  explicitThinkingOptionId: string | null | undefined;
}) {
  const { models, runtimeModelId, configuredModelId, explicitThinkingOptionId } = input;
  const normalizedRuntimeModelId = normalizeModelId(runtimeModelId);
  const normalizedConfiguredModelId = normalizeModelId(configuredModelId);
  const runtimeSelectedModel =
    models && normalizedRuntimeModelId
      ? (models.find((model) => model.id === normalizedRuntimeModelId) ?? null)
      : null;
  const preferredModelId =
    runtimeSelectedModel?.id ?? normalizedConfiguredModelId ?? normalizedRuntimeModelId;
  const fallbackModel =
    models?.find((model) => model.isDefault) ?? models?.[0] ?? null;
  const selectedModel =
    models && preferredModelId
      ? (models.find((model) => model.id === preferredModelId) ?? fallbackModel ?? null)
      : fallbackModel;

  const activeModelId = selectedModel?.id ?? preferredModelId ?? null;
  const displayModel =
    selectedModel?.label ?? preferredModelId ?? fallbackModel?.label ?? "Unknown model";

  const thinkingOptions = selectedModel?.thinkingOptions ?? null;
  const selectedThinkingId =
    explicitThinkingOptionId && explicitThinkingOptionId !== "default"
      ? explicitThinkingOptionId
      : (selectedModel?.defaultThinkingOptionId ?? null);
  const selectedThinking =
    thinkingOptions?.find((option) => option.id === selectedThinkingId) ?? null;
  const displayThinking =
    selectedThinking?.label ??
    (selectedThinkingId === "default" ? "Model default" : (selectedThinkingId ?? "Default"));

  return {
    selectedModel,
    activeModelId,
    displayModel,
    thinkingOptions,
    selectedThinkingId,
    displayThinking,
  };
}
