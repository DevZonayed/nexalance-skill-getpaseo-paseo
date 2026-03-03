import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import {
  computeWorkspaceTabLayout,
  type WorkspaceTabLayoutResult,
} from "@/screens/workspace/workspace-tab-layout";

type UseWorkspaceTabLayoutInput = {
  tabLabels: string[];
  metrics: {
    rowHorizontalInset: number;
    actionsReservedWidth: number;
    rowPaddingHorizontal: number;
    tabGap: number;
    maxTabWidth: number;
    iconOnlyTabWidth: number;
    tabBaseWidthWithClose: number;
    minLabelChars: number;
    charWidth: number;
  };
};

type UseWorkspaceTabLayoutResult = {
  layout: WorkspaceTabLayoutResult;
};

export function useWorkspaceTabLayout(input: UseWorkspaceTabLayoutInput): UseWorkspaceTabLayoutResult {
  const { width: viewportWidth } = useWindowDimensions();

  const layout = useMemo(
    () =>
      computeWorkspaceTabLayout({
        viewportWidth,
        tabLabelLengths: input.tabLabels.map((label) => label.length),
        metrics: input.metrics,
      }),
    [input.metrics, input.tabLabels, viewportWidth]
  );

  return {
    layout,
  };
}
