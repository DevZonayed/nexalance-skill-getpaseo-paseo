import { describe, expect, it } from "vitest";
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";

import {
  parseClaudeSdkModelDescriptorForTest,
  resolveClaudeModelsFromSdkModels,
} from "./sdk-model-resolver.js";

describe("resolveClaudeModelsFromSdkModels", () => {
  const sdkModels: ModelInfo[] = [
    {
      value: "default",
      displayName: "Default (recommended)",
      description: "Sonnet 4.6 · Best for everyday tasks",
      supportsEffort: true,
      supportedEffortLevels: ["low", "medium", "high", "max"],
      supportsAdaptiveThinking: true,
    },
    {
      value: "opus",
      displayName: "Opus",
      description: "Opus 4.6 · Most capable for complex work",
      supportsEffort: true,
      supportedEffortLevels: ["low", "medium", "high", "max"],
      supportsAdaptiveThinking: true,
      supportsFastMode: true,
    },
    {
      value: "sonnet",
      displayName: "Sonnet",
      description: "Sonnet 4.6 · Best for everyday tasks",
      supportsEffort: true,
      supportedEffortLevels: ["low", "medium", "high", "max"],
      supportsAdaptiveThinking: true,
    },
    {
      value: "haiku",
      displayName: "Haiku",
      description: "Haiku 4.5 · Fastest for quick answers",
    },
  ];

  it("parses family and version from SDK descriptions", () => {
    expect(parseClaudeSdkModelDescriptorForTest(sdkModels[0]!)).toEqual({
      family: "sonnet",
      version: "4.6",
    });
    expect(parseClaudeSdkModelDescriptorForTest(sdkModels[1]!)).toEqual({
      family: "opus",
      version: "4.6",
    });
    expect(parseClaudeSdkModelDescriptorForTest(sdkModels[2]!)).toEqual({
      family: "sonnet",
      version: "4.6",
    });
    expect(parseClaudeSdkModelDescriptorForTest(sdkModels[3]!)).toEqual({
      family: "haiku",
      version: "4.5",
    });
  });

  it("maps SDK models to parsed Claude model ids", () => {
    const models = resolveClaudeModelsFromSdkModels(sdkModels);

    expect(models).toEqual([
      expect.objectContaining({
        provider: "claude",
        id: "claude-sonnet-4-6",
        label: "Sonnet 4.6",
        isDefault: true,
        thinkingOptions: [
          { id: "low", label: "Low" },
          { id: "medium", label: "Medium" },
          { id: "high", label: "High" },
          { id: "max", label: "Max" },
        ],
      }),
      expect.objectContaining({
        provider: "claude",
        id: "claude-opus-4-6",
        label: "Opus 4.6",
      }),
      expect.objectContaining({
        provider: "claude",
        id: "claude-haiku-4-5",
        label: "Haiku 4.5",
      }),
    ]);
  });
});
