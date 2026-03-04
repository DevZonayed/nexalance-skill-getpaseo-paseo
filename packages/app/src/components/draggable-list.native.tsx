import { RefreshControl } from "react-native";
import { useCallback, useState } from "react";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { useUnistyles } from "react-native-unistyles";
import type {
  DraggableListProps,
  DraggableRenderItemInfo,
} from "./draggable-list.types";

export type { DraggableListProps, DraggableRenderItemInfo };

export function DraggableList<T>({
  data,
  keyExtractor,
  renderItem,
  onDragEnd,
  style,
  containerStyle,
  contentContainerStyle,
  testID,
  ListFooterComponent,
  ListHeaderComponent,
  ListEmptyComponent,
  showsVerticalScrollIndicator = true,
  enableDesktopWebScrollbar: _enableDesktopWebScrollbar = false,
  scrollEnabled = true,
  useDragHandle: _useDragHandle = false,
  refreshing,
  onRefresh,
  simultaneousGestureRef,
  waitFor,
  onDragBegin: onDragBeginProp,
  onDragIntent: onDragIntentProp,
  onDragRelease: onDragReleaseProp,
  nestable: _nestable = false,
}: DraggableListProps<T>) {
  const { theme } = useUnistyles();
  const [isDragging, setIsDragging] = useState(false);

  const simultaneousHandlers = simultaneousGestureRef ? [simultaneousGestureRef] : undefined;

  const handleRenderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<T>) => {
      const index = getIndex() ?? 0;
      const itemKey = keyExtractor(item, index);
      const dragWithLog = () => {
        console.log("[sidebar-dnd-debug] row drag() called", { testID, itemKey, index });
        onDragIntentProp?.();
        drag();
      };
      const info: DraggableRenderItemInfo<T> = {
        item,
        index,
        drag: dragWithLog,
        isActive,
      };
      return renderItem(info);
    },
    [keyExtractor, onDragIntentProp, renderItem, testID]
  );

  const handleDragEnd = useCallback(
    ({ data: newData }: { data: T[] }) => {
      console.log("[sidebar-dnd-debug] list onDragEnd", { testID, count: newData.length });
      setIsDragging(false);
      onDragEnd(newData);
    },
    [onDragEnd, testID]
  );

  const handleDragBegin = useCallback(() => {
    console.log("[sidebar-dnd-debug] list onDragBegin", { testID });
    setIsDragging(true);
    onDragBeginProp?.();
  }, [onDragBeginProp, testID]);

  const handleRelease = useCallback(() => {
    console.log("[sidebar-dnd-debug] list onRelease", { testID });
    setIsDragging(false);
    onDragReleaseProp?.();
  }, [onDragReleaseProp, testID]);

  const showRefreshControl = Boolean(onRefresh) && (!isDragging || Boolean(refreshing));
  const resolvedContainerStyle =
    containerStyle ?? (scrollEnabled ? { flex: 1 } : undefined);
  const shouldShowRefreshControl = showRefreshControl;

  return (
    <DraggableFlatList
      testID={testID}
      data={data}
      keyExtractor={keyExtractor}
      renderItem={handleRenderItem}
      onDragEnd={handleDragEnd}
      style={style}
      containerStyle={resolvedContainerStyle}
      contentContainerStyle={contentContainerStyle}
      ListFooterComponent={ListFooterComponent}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      scrollEnabled={scrollEnabled}
      simultaneousHandlers={simultaneousHandlers}
      activationDistance={6}
      onDragBegin={handleDragBegin}
      onRelease={handleRelease}
      // @ts-ignore - waitFor is supported by RNGH FlatList but missing from DraggableFlatList types
      waitFor={waitFor}
      refreshControl={
        shouldShowRefreshControl ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={theme.colors.foregroundMuted}
            colors={[theme.colors.foregroundMuted]}
          />
        ) : undefined
      }
    />
  );
}
