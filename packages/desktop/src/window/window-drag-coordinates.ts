export type WindowMovePayload = {
  screenX: number;
  screenY: number;
};

export type WindowMoveState = {
  offsetX: number;
  offsetY: number;
};

export type WindowPosition = {
  x: number;
  y: number;
};

type WindowMovePayloadInput =
  | {
      screenX?: unknown;
      screenY?: unknown;
    }
  | null
  | undefined;

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function readWindowMovePayload(input: WindowMovePayloadInput): WindowMovePayload | null {
  if (!isFiniteCoordinate(input?.screenX) || !isFiniteCoordinate(input?.screenY)) {
    return null;
  }

  return {
    screenX: input.screenX,
    screenY: input.screenY,
  };
}

export function createWindowMoveState(input: {
  payload: WindowMovePayload;
  windowX: number;
  windowY: number;
}): WindowMoveState | null {
  const offsetX = input.payload.screenX - input.windowX;
  const offsetY = input.payload.screenY - input.windowY;
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
    return null;
  }

  return { offsetX, offsetY };
}

export function resolveWindowMovePosition(input: {
  payload: WindowMovePayload;
  state: WindowMoveState;
}): WindowPosition | null {
  const x = Math.round(input.payload.screenX - input.state.offsetX);
  const y = Math.round(input.payload.screenY - input.state.offsetY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}
