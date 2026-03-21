import { describe, expect, it } from "vitest";
import {
  getStatusSelectorHint,
  normalizeModelId,
  resolveAgentModelSelection,
} from "./agent-status-bar.utils";

describe("getStatusSelectorHint", () => {
  it("explains what each editable status control does", () => {
    expect(getStatusSelectorHint("thinking")).toBe("Thinking mode");
    expect(getStatusSelectorHint("model")).toBe("Change model");
    expect(getStatusSelectorHint("mode")).toBe("Change permission mode");
  });
});

describe("normalizeModelId", () => {
  it("treats empty and default values as unset", () => {
    expect(normalizeModelId("")).toBeNull();
    expect(normalizeModelId(" default ")).toBeNull();
    expect(normalizeModelId(undefined)).toBeNull();
  });

  it("returns trimmed model ids", () => {
    expect(normalizeModelId(" gpt-5.1-codex ")).toBe("gpt-5.1-codex");
  });
});

describe("resolveAgentModelSelection", () => {
  it("prefers runtime model over configured model", () => {
    const selection = resolveAgentModelSelection({
      models: [
        {
          id: "a",
          provider: "codex",
          label: "Model A",
          thinkingOptions: [{ id: "low", label: "Low" }],
          defaultThinkingOptionId: "low",
        },
      ],
      runtimeModelId: "a",
      configuredModelId: "b",
      explicitThinkingOptionId: null,
    });

    expect(selection.activeModelId).toBe("a");
    expect(selection.displayModel).toBe("Model A");
    expect(selection.selectedThinkingId).toBe("low");
  });

  it("uses explicit thinking option when provided", () => {
    const selection = resolveAgentModelSelection({
      models: [
        {
          id: "a",
          provider: "codex",
          label: "Model A",
          thinkingOptions: [
            { id: "low", label: "Low" },
            { id: "high", label: "High" },
          ],
          defaultThinkingOptionId: "low",
        },
      ],
      runtimeModelId: "a",
      configuredModelId: null,
      explicitThinkingOptionId: "high",
    });

    expect(selection.selectedThinkingId).toBe("high");
    expect(selection.displayThinking).toBe("High");
  });
});
