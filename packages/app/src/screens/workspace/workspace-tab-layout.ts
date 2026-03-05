export type WorkspaceTabCloseButtonPolicy = "all";

export type WorkspaceTabLayoutInput = {
  viewportWidth: number;
  tabLabelLengths: number[];
  metrics: {
    rowHorizontalInset: number;
    actionsReservedWidth: number;
    rowPaddingHorizontal: number;
    tabGap: number;
    maxTabWidth: number;
    tabIconWidth: number;
    tabHorizontalPadding: number;
    estimatedCharWidth: number;
    closeButtonWidth: number;
  };
};

export type WorkspaceTabLayoutItem = {
  width: number;
  showLabel: boolean;
  labelCharCap: number;
};

export type WorkspaceTabLayoutResult = {
  items: WorkspaceTabLayoutItem[];
  closeButtonPolicy: WorkspaceTabCloseButtonPolicy;
  requiresHorizontalScrollFallback: boolean;
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

export function computeWorkspaceTabLayout(
  input: WorkspaceTabLayoutInput
): WorkspaceTabLayoutResult {
  const tabCount = input.tabLabelLengths.length;
  if (tabCount === 0) {
    return {
      items: [],
      closeButtonPolicy: "all",
      requiresHorizontalScrollFallback: false,
    };
  }

  const availableWidth = Math.max(
    0,
    input.viewportWidth - input.metrics.rowHorizontalInset * 2 - input.metrics.actionsReservedWidth
  );
  const rowOverhead =
    input.metrics.rowPaddingHorizontal * 2 + Math.max(tabCount - 1, 0) * input.metrics.tabGap;
  const availableTabsWidth = Math.max(0, availableWidth - rowOverhead);
  const iconOnlyTabWidth =
    input.metrics.tabIconWidth + input.metrics.tabHorizontalPadding * 2 + input.metrics.closeButtonWidth;
  const estimateLabelWidth = (labelLength: number) => labelLength * input.metrics.estimatedCharWidth;
  const desiredTabWidths = input.tabLabelLengths.map((rawLength) => {
    const labelLength = Math.max(rawLength, 1);
    const estimatedWidth = iconOnlyTabWidth + estimateLabelWidth(labelLength);
    return clamp(estimatedWidth, iconOnlyTabWidth, input.metrics.maxTabWidth);
  });

  const desiredTotalTabsWidth = sum(desiredTabWidths);
  const iconOnlyTotalTabsWidth = iconOnlyTabWidth * tabCount;
  const requiresHorizontalScrollFallback = availableTabsWidth < iconOnlyTotalTabsWidth;

  let resolvedWidths: number[];
  if (desiredTotalTabsWidth <= availableTabsWidth) {
    resolvedWidths = desiredTabWidths;
  } else if (availableTabsWidth <= iconOnlyTotalTabsWidth) {
    resolvedWidths = new Array(tabCount).fill(iconOnlyTabWidth);
  } else {
    const desiredExpandableWidth = desiredTotalTabsWidth - iconOnlyTotalTabsWidth;
    const availableExpandableWidth = availableTabsWidth - iconOnlyTotalTabsWidth;
    const proportionalRatio =
      desiredExpandableWidth > 0 ? availableExpandableWidth / desiredExpandableWidth : 0;
    resolvedWidths = desiredTabWidths.map(
      (desiredWidth) => iconOnlyTabWidth + (desiredWidth - iconOnlyTabWidth) * proportionalRatio
    );
  }

  const roundedWidths = resolvedWidths.map((width) =>
    Math.round(clamp(width, iconOnlyTabWidth, input.metrics.maxTabWidth))
  );

  return {
    items: roundedWidths.map((width) => {
      const rawCharCap = Math.floor((width - iconOnlyTabWidth) / input.metrics.estimatedCharWidth);
      const labelCharCap = Math.max(0, rawCharCap);
      return {
        width,
        showLabel: labelCharCap > 0,
        labelCharCap,
      };
    }),
    closeButtonPolicy: "all",
    requiresHorizontalScrollFallback,
  };
}
