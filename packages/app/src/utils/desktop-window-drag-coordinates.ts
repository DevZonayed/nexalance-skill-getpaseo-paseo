export type DesktopWindowScreenPoint = {
  screenX: number;
  screenY: number;
};

type ScreenPointInput =
  | {
      screenX?: unknown;
      screenY?: unknown;
    }
  | null
  | undefined;

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function readFiniteScreenPoint(input: ScreenPointInput): DesktopWindowScreenPoint | null {
  if (!isFiniteCoordinate(input?.screenX) || !isFiniteCoordinate(input?.screenY)) {
    return null;
  }

  return {
    screenX: input.screenX,
    screenY: input.screenY,
  };
}
