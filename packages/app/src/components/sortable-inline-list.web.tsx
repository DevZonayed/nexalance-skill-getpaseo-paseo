import { useCallback, useState, type ReactElement } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  type Modifier,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DraggableRenderItemInfo } from "./draggable-list.types";

const restrictToHorizontalAxis: Modifier = ({ transform }) => ({
  ...transform,
  y: 0,
});

function SortableItem<T>({
  id,
  item,
  index,
  renderItem,
  activeId,
  useDragHandle,
  disabled,
}: {
  id: string;
  item: T;
  index: number;
  renderItem: (info: DraggableRenderItemInfo<T>) => ReactElement;
  activeId: string | null;
  useDragHandle: boolean;
  disabled: boolean;
}): ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const drag = useCallback(() => {
    // dnd-kit handles drag initiation via listeners
    // This is a no-op but matches the mobile API
  }, []);

  // See `draggable-list.web.tsx` for details on why we zero out dnd-kit scale.
  const baseTransform = CSS.Transform.toString(
    transform && isDragging ? { ...transform, scaleX: 1, scaleY: 1 } : transform
  );
  const scaleTransform = isDragging ? "scale(1.01)" : "";
  const combinedTransform = [baseTransform, scaleTransform].filter(Boolean).join(" ");

  const style = {
    transform: combinedTransform || undefined,
    transition,
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const info: DraggableRenderItemInfo<T> = {
    item,
    index,
    drag,
    isActive: activeId === id,
    dragHandleProps: useDragHandle
      ? {
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: listeners as unknown as Record<string, unknown>,
          setActivatorNodeRef: setActivatorNodeRef as unknown as (
            node: unknown
          ) => void,
        }
      : undefined,
  };

  const wrapperProps = useDragHandle
    ? { ref: setNodeRef }
    : { ref: setNodeRef, ...attributes, ...listeners };

  return (
    <div {...wrapperProps} style={style}>
      {renderItem(info)}
    </div>
  );
}

export function SortableInlineList<T>({
  data,
  keyExtractor,
  renderItem,
  onDragEnd,
  useDragHandle = false,
  disabled = false,
  activationDistance = 8,
  onDragBegin,
}: {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: DraggableRenderItemInfo<T>) => ReactElement;
  onDragEnd?: (data: T[]) => void;
  useDragHandle?: boolean;
  disabled?: boolean;
  activationDistance?: number;
  onDragBegin?: () => void;
}): ReactElement {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragItems, setDragItems] = useState<T[] | null>(null);
  const items = dragItems ?? data;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: activationDistance,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (disabled) {
        return;
      }
      setDragItems(data);
      setActiveId(String(event.active.id));
      onDragBegin?.();
    },
    [data, disabled, onDragBegin]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveId(null);
      setDragItems(null);

      if (disabled) {
        return;
      }

      if (over && active.id !== over.id) {
        const oldIndex = items.findIndex(
          (item, i) => keyExtractor(item, i) === active.id
        );
        const newIndex = items.findIndex(
          (item, i) => keyExtractor(item, i) === over.id
        );

        if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
          const newItems = arrayMove(items, oldIndex, newIndex);
          setDragItems(newItems);
          onDragEnd?.(newItems);
        }
      }

    },
    [disabled, items, keyExtractor, onDragEnd]
  );

  const ids = items.map((item, index) => keyExtractor(item, index));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        {items.map((item, index) => {
          const id = keyExtractor(item, index);
          return (
            <SortableItem
              key={id}
              id={id}
              item={item}
              index={index}
              renderItem={renderItem}
              activeId={activeId}
              useDragHandle={useDragHandle}
              disabled={disabled}
            />
          );
        })}
      </SortableContext>
    </DndContext>
  );
}
