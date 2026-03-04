export type LongPressMoveDecision = "none" | "cancel_long_press" | "start_drag";

export function decideLongPressMove(input: {
  longPressArmed: boolean;
  didStartDrag: boolean;
  startPoint: { x: number; y: number } | null;
  currentPoint: { x: number; y: number };
  cancelSlopPx?: number;
  dragSlopPx?: number;
}): LongPressMoveDecision {
  const cancelSlopPx = input.cancelSlopPx ?? 10;
  const dragSlopPx = input.dragSlopPx ?? 8;

  if (!input.startPoint) {
    return "none";
  }
  if (input.didStartDrag) {
    return "none";
  }

  const dx = input.currentPoint.x - input.startPoint.x;
  const dy = input.currentPoint.y - input.startPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (!input.longPressArmed) {
    return distance > cancelSlopPx ? "cancel_long_press" : "none";
  }
  return distance > dragSlopPx ? "start_drag" : "none";
}

export function shouldOpenContextMenuOnPressOut(input: {
  longPressArmed: boolean;
  didStartDrag: boolean;
}): boolean {
  return input.longPressArmed && !input.didStartDrag;
}

