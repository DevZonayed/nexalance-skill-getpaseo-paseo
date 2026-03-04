import { describe, expect, it } from "vitest";
import { computeWorkspaceTabLayout } from "@/screens/workspace/workspace-tab-layout";

const metrics = {
  rowHorizontalInset: 0,
  actionsReservedWidth: 120,
  rowPaddingHorizontal: 8,
  tabGap: 4,
  minTabWidth: 60,
  maxTabWidth: 260,
  tabIconWidth: 14,
  tabHorizontalPadding: 12,
  estimatedCharWidth: 7,
  closeButtonWidth: 22,
  compactLabelCharCap: 10,
  compactDenseLabelCharCap: 8,
};

describe("computeWorkspaceTabLayout", () => {
  it("keeps full width tabs when space is available", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1200,
      tabLabelLengths: [8, 10, 7],
      metrics,
    });

    expect(result.mode).toBe("full");
    expect(result.showLabels).toBe(true);
    expect(result.showCloseButtons).toBe(true);
  });

  it("uses compact mode before icon-only", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 570,
      tabLabelLengths: [24, 12, 8],
      metrics,
    });

    expect(result.mode).toBe("compact");
    expect(result.showLabels).toBe(true);
    expect(result.showCloseButtons).toBe(false);
  });

  it("falls back to icon mode when compact labels still cannot fit", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 300,
      tabLabelLengths: [14, 14, 14, 14],
      metrics,
    });

    expect(result.mode).toBe("icon");
    expect(result.showLabels).toBe(false);
    expect(result.showCloseButtons).toBe(false);
  });

  it("keeps icon mode without scroll when icons can fit", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 380,
      tabLabelLengths: [20, 20, 20, 20],
      metrics,
    });

    expect(result.mode).toBe("icon");
  });

  it("keeps compact-with-label mode for realistic desktop width with nine tabs", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1180,
      tabLabelLengths: [18, 21, 14, 15, 19, 12, 17, 16, 20],
      metrics,
    });

    expect(result.mode).toBe("compact");
    expect(result.showLabels).toBe(true);
    expect(result.showCloseButtons).toBe(false);
  });

  it("uses dense compact labels for larger tab counts before icon-only", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1100,
      tabLabelLengths: [18, 21, 14, 15, 19, 12, 17, 16, 20],
      metrics,
    });

    expect(result.mode).toBe("compact");
    expect(result.showLabels).toBe(true);
    expect(result.showCloseButtons).toBe(false);
  });
});
