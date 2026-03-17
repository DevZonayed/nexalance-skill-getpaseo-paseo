import { useCallback, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { View, type LayoutChangeEvent } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type SplitDropZonePosition = "center" | "left" | "right" | "top" | "bottom";

export interface SplitDropZoneHover {
  paneId: string;
  position: SplitDropZonePosition;
}

export interface SplitDropZoneProps {
  paneId: string;
  active: boolean;
  preview: SplitDropZoneHover | null;
  onHoverChange: (hover: SplitDropZoneHover | null) => void;
}

interface LayoutSize {
  width: number;
  height: number;
}

const EDGE_RATIO = 0.15;
const CENTER_RATIO = 0.4;

export function buildSplitDropZoneId(paneId: string): string {
  return `split-pane-drop:${paneId}`;
}

export function SplitDropZone({
  paneId,
  active,
  preview,
  onHoverChange,
}: SplitDropZoneProps) {
  const { theme } = useUnistyles();
  const [layoutSize, setLayoutSize] = useState<LayoutSize>({ width: 0, height: 0 });
  const { setNodeRef, isOver } = useDroppable({
    id: buildSplitDropZoneId(paneId),
    disabled: !active,
    data: {
      kind: "split-pane-drop",
      paneId,
    },
  });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    const height = Math.round(event.nativeEvent.layout.height);
    setLayoutSize((current) =>
      current.width === width && current.height === height ? current : { width, height }
    );
  }, []);

  const updateHover = useCallback(
    (event: any) => {
      if (!active || layoutSize.width <= 0 || layoutSize.height <= 0) {
        return;
      }
      const locationX = Number(event.nativeEvent.locationX ?? 0);
      const locationY = Number(event.nativeEvent.locationY ?? 0);
      onHoverChange({
        paneId,
        position: resolveDropPosition({
          width: layoutSize.width,
          height: layoutSize.height,
          x: locationX,
          y: locationY,
        }),
      });
    },
    [active, layoutSize.height, layoutSize.width, onHoverChange, paneId]
  );

  const previewStyle = useMemo(() => {
    if (!preview || preview.paneId !== paneId) {
      return null;
    }
    return [
      styles.preview,
      getPreviewStyle(preview.position),
      {
        backgroundColor: theme.colors.accent,
      },
    ];
  }, [paneId, preview, theme.colors.accent]);

  if (!active) {
    return null;
  }

  return (
    <View
      ref={setNodeRef as any}
      style={[styles.overlay, isOver && styles.overlayActive]}
      onLayout={handleLayout}
      onPointerEnter={updateHover}
      onPointerMove={updateHover}
      onPointerLeave={() => {
        if (preview?.paneId === paneId) {
          onHoverChange(null);
        }
      }}
    >
      {previewStyle ? <View pointerEvents="none" style={previewStyle} /> : null}
    </View>
  );
}

function resolveDropPosition(input: {
  width: number;
  height: number;
  x: number;
  y: number;
}): SplitDropZonePosition {
  const centerInsetX = input.width * ((1 - CENTER_RATIO) / 2);
  const centerInsetY = input.height * ((1 - CENTER_RATIO) / 2);
  const insideCenterX =
    input.x >= centerInsetX && input.x <= input.width - centerInsetX;
  const insideCenterY =
    input.y >= centerInsetY && input.y <= input.height - centerInsetY;

  if (insideCenterX && insideCenterY) {
    return "center";
  }

  const edgeThresholdX = input.width * EDGE_RATIO;
  const edgeThresholdY = input.height * EDGE_RATIO;
  if (input.x <= edgeThresholdX) {
    return "left";
  }
  if (input.x >= input.width - edgeThresholdX) {
    return "right";
  }
  if (input.y <= edgeThresholdY) {
    return "top";
  }
  if (input.y >= input.height - edgeThresholdY) {
    return "bottom";
  }

  const distances = [
    { position: "left", distance: input.x },
    { position: "right", distance: input.width - input.x },
    { position: "top", distance: input.y },
    { position: "bottom", distance: input.height - input.y },
  ] satisfies Array<{ position: Exclude<SplitDropZonePosition, "center">; distance: number }>;
  distances.sort((left, right) => left.distance - right.distance);
  return distances[0]?.position ?? "center";
}

function getPreviewStyle(position: SplitDropZonePosition) {
  if (position === "left") {
    return styles.previewLeft;
  }
  if (position === "right") {
    return styles.previewRight;
  }
  if (position === "top") {
    return styles.previewTop;
  }
  if (position === "bottom") {
    return styles.previewBottom;
  }
  return styles.previewCenter;
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  overlayActive: {
    backgroundColor: theme.colors.surface0,
    opacity: 0.02,
  },
  preview: {
    position: "absolute",
    borderRadius: theme.borderRadius.md,
    opacity: 0.16,
  },
  previewLeft: {
    left: 0,
    top: 0,
    bottom: 0,
    width: "50%",
  },
  previewRight: {
    right: 0,
    top: 0,
    bottom: 0,
    width: "50%",
  },
  previewTop: {
    left: 0,
    top: 0,
    right: 0,
    height: "50%",
  },
  previewBottom: {
    left: 0,
    right: 0,
    bottom: 0,
    height: "50%",
  },
  previewCenter: {
    left: "30%",
    top: "30%",
    right: "30%",
    bottom: "30%",
  },
}));
