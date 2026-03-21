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
  if (!normalized || normalized.toLowerCase() === "default") {
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
  const preferredModelId = normalizedRuntimeModelId ?? normalizedConfiguredModelId;
  const selectedModel =
    models && preferredModelId
      ? (models.find((model) => model.id === preferredModelId) ?? null)
      : null;

  const activeModelId = selectedModel?.id ?? preferredModelId ?? null;
  const displayModel = selectedModel?.label ?? preferredModelId ?? "Auto";

  const thinkingOptions = selectedModel?.thinkingOptions ?? null;
  const selectedThinkingId =
    explicitThinkingOptionId && explicitThinkingOptionId !== "default"
      ? explicitThinkingOptionId
      : (selectedModel?.defaultThinkingOptionId ?? null);
  const selectedThinking =
    thinkingOptions?.find((option) => option.id === selectedThinkingId) ?? null;
  const displayThinking =
    selectedThinking?.label ??
    (selectedThinkingId === "default" ? "Model default" : (selectedThinkingId ?? "auto"));

  return {
    selectedModel,
    activeModelId,
    displayModel,
    thinkingOptions,
    selectedThinkingId,
    displayThinking,
  };
}
