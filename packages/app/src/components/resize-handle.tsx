import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  groupId: string;
  index: number;
  sizes: number[];
  onResizeSplit: (groupId: string, sizes: number[]) => void;
}

interface PointerState {
  containerSize: number;
  pointerStart: number;
  leftSize: number;
  rightSize: number;
}

export function ResizeHandle({
  direction,
  groupId,
  index,
  sizes,
  onResizeSplit,
}: ResizeHandleProps) {
  const { theme } = useUnistyles();
  const pointerStateRef = useRef<PointerState | null>(null);
  const [hovered, setHovered] = useState(false);

  const handlePointerDown = useCallback(
    (event: any) => {
      const handleElement = event.currentTarget as HTMLElement | null;
      const containerElement = handleElement?.parentElement ?? null;
      if (!containerElement) {
        return;
      }

      const rect = containerElement.getBoundingClientRect();
      const containerSize = direction === "horizontal" ? rect.width : rect.height;
      if (containerSize <= 0) {
        return;
      }

      pointerStateRef.current = {
        containerSize,
        pointerStart: direction === "horizontal" ? event.clientX : event.clientY,
        leftSize: sizes[index] ?? 0,
        rightSize: sizes[index + 1] ?? 0,
      };

      const previousCursor = document.body.style.cursor;
      const nextCursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.cursor = nextCursor;
      event.preventDefault();

      function cleanup() {
        pointerStateRef.current = null;
        document.body.style.cursor = previousCursor;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      }

      function handlePointerMove(moveEvent: PointerEvent) {
        const pointerState = pointerStateRef.current;
        if (!pointerState) {
          return;
        }

        const pointerCurrent =
          direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
        const deltaRatio =
          (pointerCurrent - pointerState.pointerStart) / pointerState.containerSize;

        const nextSizes = sizes.slice();
        nextSizes[index] = pointerState.leftSize + deltaRatio;
        nextSizes[index + 1] = pointerState.rightSize - deltaRatio;
        onResizeSplit(groupId, nextSizes);
      }

      function handlePointerUp() {
        cleanup();
      }

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [direction, groupId, index, onResizeSplit, sizes]
  );

  return (
    <View
      role="separator"
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      style={[
        styles.handle,
        direction === "horizontal" ? styles.handleHorizontal : styles.handleVertical,
        hovered && {
          backgroundColor: theme.colors.surface2,
        },
        {
          cursor: direction === "horizontal" ? "col-resize" : "row-resize",
        } as any,
      ]}
      onPointerDown={handlePointerDown}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <View
        style={[
          styles.handleGrip,
          direction === "horizontal" ? styles.handleGripHorizontal : styles.handleGripVertical,
          {
            backgroundColor: hovered ? theme.colors.accent : theme.colors.border,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  handle: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: "transparent",
  },
  handleHorizontal: {
    width: 4,
    alignSelf: "stretch",
  },
  handleVertical: {
    height: 4,
    width: "100%",
  },
  handleGrip: {
    opacity: 0.6,
    borderRadius: theme.borderRadius.full,
  },
  handleGripHorizontal: {
    width: 2,
    height: "100%",
  },
  handleGripVertical: {
    width: "100%",
    height: 2,
  },
}));
