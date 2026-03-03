export type WorkspaceTabLayoutMode = "full" | "compact" | "icon";

export type WorkspaceTabLayoutInput = {
  viewportWidth: number;
  tabLabelLengths: number[];
  metrics: {
    rowHorizontalInset: number;
    actionsReservedWidth: number;
    rowPaddingHorizontal: number;
    tabGap: number;
    minTabWidth: number;
    maxTabWidth: number;
    tabIconWidth: number;
    tabHorizontalPadding: number;
    estimatedCharWidth: number;
    closeButtonWidth: number;
  };
};

export type WorkspaceTabLayoutResult = {
  mode: WorkspaceTabLayoutMode;
  showLabels: boolean;
  showCloseButtons: boolean;
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function sum(values: number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

function computeTotalRowWidth(input: { itemWidths: number[]; tabGap: number; rowPaddingHorizontal: number }): number {
  if (input.itemWidths.length === 0) {
    return 0;
  }
  return (
    input.rowPaddingHorizontal * 2 +
    sum(input.itemWidths) +
    Math.max(input.itemWidths.length - 1, 0) * input.tabGap
  );
}

export function computeWorkspaceTabLayout(
  input: WorkspaceTabLayoutInput
): WorkspaceTabLayoutResult {
  const tabCount = input.tabLabelLengths.length;
  if (tabCount === 0) {
    return {
      mode: "full",
      showLabels: true,
      showCloseButtons: true,
    };
  }

  const availableWidth = Math.max(
    0,
    input.viewportWidth - input.metrics.rowHorizontalInset * 2 - input.metrics.actionsReservedWidth
  );
  const baseTabWidth = input.metrics.tabIconWidth + input.metrics.tabHorizontalPadding * 2;
  const estimateLabelWidth = (labelLength: number) => labelLength * input.metrics.estimatedCharWidth;

  const fullTabWidths = input.tabLabelLengths.map((rawLength) => {
    const labelLength = Math.max(rawLength, 1);
    const estimatedWidth = baseTabWidth + estimateLabelWidth(labelLength) + input.metrics.closeButtonWidth;
    return clamp(estimatedWidth, input.metrics.minTabWidth, input.metrics.maxTabWidth);
  });
  const fullTotal = computeTotalRowWidth({
    itemWidths: fullTabWidths,
    tabGap: input.metrics.tabGap,
    rowPaddingHorizontal: input.metrics.rowPaddingHorizontal,
  });
  if (fullTotal <= availableWidth) {
    return { mode: "full", showLabels: true, showCloseButtons: true };
  }

  const compactTabWidths = input.tabLabelLengths.map((rawLength) => {
    const labelLength = Math.max(rawLength, 1);
    const estimatedWidth = baseTabWidth + estimateLabelWidth(labelLength);
    return clamp(estimatedWidth, input.metrics.minTabWidth, input.metrics.maxTabWidth);
  });
  const compactTotal = computeTotalRowWidth({
    itemWidths: compactTabWidths,
    tabGap: input.metrics.tabGap,
    rowPaddingHorizontal: input.metrics.rowPaddingHorizontal,
  });
  if (compactTotal <= availableWidth) {
    return { mode: "compact", showLabels: true, showCloseButtons: false };
  }

  return { mode: "icon", showLabels: false, showCloseButtons: false };
}
