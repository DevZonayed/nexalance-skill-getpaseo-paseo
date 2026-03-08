import { useEffect, useRef, useState } from "react";
import type { BottomAnchorTransportBehavior } from "./agent-stream-render-strategy";

export type BottomAnchorMode = "sticky-bottom" | "detached";

export type BottomAnchorRouteRequest = {
  reason: "initial-entry" | "resume";
  agentId: string;
  requestKey: string;
};

export type BottomAnchorLocalRequest = {
  reason: "jump-to-bottom" | "message-sent";
  agentId: string;
};

export type BottomAnchorBlockedReason =
  | "waiting_for_history_readiness"
  | "waiting_for_measurable_viewport"
  | "waiting_for_measurable_content"
  | "waiting_for_post_layout_verification";

type BottomAnchorRequestReason =
  | BottomAnchorRouteRequest["reason"]
  | BottomAnchorLocalRequest["reason"];

type BottomAnchorRequest = {
  id: number;
  agentId: string;
  reason: BottomAnchorRequestReason;
  requestKey: string;
};

type ControllerMeasurementState = {
  containerKey: string;
  viewportWidth: number;
  viewportHeight: number;
  contentHeight: number;
  offsetY: number;
  viewportMeasuredForKey: string | null;
  contentMeasuredForKey: string | null;
};

type AttemptContext = {
  requestId: number | null;
  retries: number;
};

type ScheduledFrameHandle = {
  cancelled: boolean;
  rafId: number | null;
  remainingFrames: number;
  callback: () => void;
};

type BottomAnchorEvent =
  | "request_created"
  | "attempt_started"
  | "attempt_verified"
  | "attempt_failed"
  | "request_fulfilled"
  | "request_cancelled"
  | "detached_by_user"
  | "blocked_reason_changed";

type BottomAnchorControllerDriver = {
  destroy: () => void;
  getSnapshot: () => {
    mode: BottomAnchorMode;
    pendingRequest: BottomAnchorRequest | null;
    pendingVerification: AttemptContext | null;
    blockedReason: BottomAnchorBlockedReason | null;
  };
  resetForAgent: () => void;
  applyRouteRequest: (request: BottomAnchorRouteRequest | null) => void;
  requestLocalAnchor: (request: BottomAnchorLocalRequest) => void;
  detachByUser: () => void;
  handleViewportMetricsChange: (params: {
    previousViewportWidth: number;
    viewportWidth: number;
    previousViewportHeight: number;
    viewportHeight: number;
  }) => void;
  handleContentSizeChange: (params: {
    previousContentHeight: number;
    contentHeight: number;
  }) => void;
  prepareForStickyViewportChange: () => void;
  prepareForStickyContentChange: () => void;
  handleScrollNearBottomChange: (params: {
    nextIsNearBottom: boolean;
    scrollDelta: number;
  }) => void;
  notifyAuthoritativeHistoryMaybeChanged: () => void;
  reevaluate: (animated?: boolean) => void;
};

type CreateBottomAnchorControllerDriverInput = {
  getAgentId: () => string;
  getIsAuthoritativeHistoryReady: () => boolean;
  getRenderStrategy: () => string;
  getTransportBehavior: () => BottomAnchorTransportBehavior;
  getMeasurementState: () => ControllerMeasurementState;
  isNearBottom: () => boolean;
  scrollToBottom: (animated: boolean) => void;
  onModeChange: (mode: BottomAnchorMode) => void;
  log: (event: BottomAnchorEvent, details: Record<string, unknown>) => void;
  warn: (details: { agentId: string; reason: BottomAnchorRequestReason }) => void;
  scheduleFrame: (params: {
    kind: "attempt" | "verification";
    callback: () => void;
    delayFrames?: number;
  }) => unknown;
  cancelFrame: (handle: unknown) => void;
};

const MAX_VERIFICATION_RETRIES = 3;
const USER_SCROLL_AWAY_DELTA_PX = 24;
const IS_DEV = Boolean((globalThis as { __DEV__?: boolean }).__DEV__);

function logBottomAnchorEvent(
  event: BottomAnchorEvent,
  details: Record<string, unknown>
): void {
  if (!IS_DEV) {
    return;
  }
  console.debug("[BottomAnchor]", event, details);
}

function scheduleAnimationFrameWithDelay(input: {
  callback: () => void;
  delayFrames?: number;
}): ScheduledFrameHandle {
  const handle: ScheduledFrameHandle = {
    cancelled: false,
    rafId: null,
    remainingFrames: Math.max(0, input.delayFrames ?? 0),
    callback: input.callback,
  };

  const tick = () => {
    if (handle.cancelled) {
      return;
    }
    if (handle.remainingFrames > 0) {
      handle.remainingFrames -= 1;
      handle.rafId = requestAnimationFrame(tick);
      return;
    }
    handle.rafId = null;
    input.callback();
  };

  handle.rafId = requestAnimationFrame(tick);
  return handle;
}

function cancelScheduledAnimationFrame(handle: unknown): void {
  const scheduled = handle as ScheduledFrameHandle | null;
  if (!scheduled) {
    return;
  }
  scheduled.cancelled = true;
  if (scheduled.rafId !== null) {
    cancelAnimationFrame(scheduled.rafId);
    scheduled.rafId = null;
  }
}

function deriveVerificationBlockedReason(input: {
  isAuthoritativeHistoryReady: boolean;
  measurementState: ControllerMeasurementState;
}): Exclude<BottomAnchorBlockedReason, "waiting_for_post_layout_verification"> | null {
  if (!input.isAuthoritativeHistoryReady) {
    return "waiting_for_history_readiness";
  }
  if (
    input.measurementState.viewportHeight <= 0 ||
    input.measurementState.viewportMeasuredForKey !== input.measurementState.containerKey
  ) {
    return "waiting_for_measurable_viewport";
  }
  if (
    input.measurementState.contentHeight <= 0 ||
    input.measurementState.contentMeasuredForKey !== input.measurementState.containerKey
  ) {
    return "waiting_for_measurable_content";
  }
  return null;
}

export function deriveBottomAnchorBlockedReason(input: {
  pendingRequest: BottomAnchorRequest | null;
  isAuthoritativeHistoryReady: boolean;
  measurementState: ControllerMeasurementState;
  pendingVerificationRequestId: number | null;
}): BottomAnchorBlockedReason | null {
  if (!input.pendingRequest) {
    return null;
  }
  if (!input.isAuthoritativeHistoryReady) {
    return "waiting_for_history_readiness";
  }
  if (
    input.measurementState.viewportHeight <= 0 ||
    input.measurementState.viewportMeasuredForKey !== input.measurementState.containerKey
  ) {
    return "waiting_for_measurable_viewport";
  }
  if (
    input.measurementState.contentHeight <= 0 ||
    input.measurementState.contentMeasuredForKey !== input.measurementState.containerKey
  ) {
    return "waiting_for_measurable_content";
  }
  if (input.pendingVerificationRequestId === input.pendingRequest.id) {
    return "waiting_for_post_layout_verification";
  }
  return null;
}

function deriveRetryDisposition(input: {
  mode: BottomAnchorMode;
  retries: number;
  verificationRetryMode: BottomAnchorTransportBehavior["verificationRetryMode"];
}): "retry-scroll" | "retry-verify" | "fail" {
  if (input.mode !== "sticky-bottom" || input.retries >= MAX_VERIFICATION_RETRIES) {
    return "fail";
  }
  return input.verificationRetryMode === "recheck"
    ? "retry-verify"
    : "retry-scroll";
}

function createBottomAnchorControllerDriver(
  input: CreateBottomAnchorControllerDriverInput
): BottomAnchorControllerDriver {
  let requestSequence = 0;
  let mode: BottomAnchorMode = "sticky-bottom";
  let pendingRequest: BottomAnchorRequest | null = null;
  let pendingVerification: AttemptContext | null = null;
  let blockedReason: BottomAnchorBlockedReason | null = null;
  let attemptHandle: unknown = null;
  let verificationHandle: unknown = null;
  let lastRouteRequestKey: string | null = null;
  let stickyMeasurementRevision = 0;
  let lastVerifiedStickyMeasurementRevision = 0;

  const getLogContext = (extra?: Record<string, unknown>) => {
    const measurementState = input.getMeasurementState();
    return {
      agentId: input.getAgentId(),
      requestReason: pendingRequest?.reason ?? null,
      authoritativeHistoryReady: input.getIsAuthoritativeHistoryReady(),
      contentHeight: measurementState.contentHeight,
      viewportHeight: measurementState.viewportHeight,
      offset: measurementState.offsetY,
      renderStrategy: input.getRenderStrategy(),
      blockedReason,
      mode,
      containerKey: measurementState.containerKey,
      ...extra,
    };
  };

  const setBlockedReason = (nextBlockedReason: BottomAnchorBlockedReason | null) => {
    if (blockedReason === nextBlockedReason) {
      return;
    }
    blockedReason = nextBlockedReason;
    input.log(
      "blocked_reason_changed",
      getLogContext({ nextBlockedReason })
    );
  };

  const setModeInternal = (nextMode: BottomAnchorMode) => {
    if (mode === nextMode) {
      return;
    }
    mode = nextMode;
    input.onModeChange(nextMode);
    if (nextMode === "detached") {
      lastVerifiedStickyMeasurementRevision = stickyMeasurementRevision;
    }
  };

  const markStickyMeasurementChanged = () => {
    stickyMeasurementRevision += 1;
  };

  const markStickyMeasurementVerified = () => {
    lastVerifiedStickyMeasurementRevision = stickyMeasurementRevision;
  };

  const cancelPendingAttempt = () => {
    if (attemptHandle) {
      input.cancelFrame(attemptHandle);
      attemptHandle = null;
    }
    if (verificationHandle) {
      input.cancelFrame(verificationHandle);
      verificationHandle = null;
    }
    pendingVerification = null;
  };

  const cancelPendingRequest = (reason: string) => {
    const currentRequest = pendingRequest;
    if (!currentRequest) {
      cancelPendingAttempt();
      setBlockedReason(null);
      return;
    }
    input.log(
      "request_cancelled",
      getLogContext({
        cancelledRequestReason: currentRequest.reason,
        cancelReason: reason,
      })
    );
    pendingRequest = null;
    cancelPendingAttempt();
    setBlockedReason(null);
  };

  const scheduleVerification = (attemptContext: AttemptContext) => {
    if (verificationHandle) {
      input.cancelFrame(verificationHandle);
    }
    verificationHandle = input.scheduleFrame({
      kind: "verification",
      delayFrames: input.getTransportBehavior().verificationDelayFrames,
      callback: () => {
        verificationHandle = null;
        const currentRequest = pendingRequest;
        const isRequestAttempt =
          currentRequest && attemptContext.requestId === currentRequest.id;
        const measurementState = input.getMeasurementState();
        const verificationBlockedReason = deriveVerificationBlockedReason({
          isAuthoritativeHistoryReady: input.getIsAuthoritativeHistoryReady(),
          measurementState,
        });

        if (verificationBlockedReason) {
          pendingVerification = attemptContext;
          setBlockedReason(verificationBlockedReason);
          return;
        }

        const verifiedNearBottom = input.isNearBottom();

        input.log(
          "attempt_verified",
          getLogContext({
            verifiedNearBottom,
            retries: attemptContext.retries,
          })
        );

        if (verifiedNearBottom) {
          pendingVerification = null;
          markStickyMeasurementVerified();
          if (isRequestAttempt) {
            input.log("request_fulfilled", getLogContext());
            pendingRequest = null;
          }
          setBlockedReason(null);
          return;
        }

        const retryDisposition = deriveRetryDisposition({
          mode,
          retries: attemptContext.retries,
          verificationRetryMode: input.getTransportBehavior().verificationRetryMode,
        });

        if (retryDisposition === "retry-verify") {
          pendingVerification = {
            requestId: attemptContext.requestId,
            retries: attemptContext.retries + 1,
          };
          setBlockedReason("waiting_for_post_layout_verification");
          scheduleVerification(pendingVerification);
          return;
        }

        if (retryDisposition === "retry-scroll") {
          pendingVerification = {
            requestId: attemptContext.requestId,
            retries: attemptContext.retries + 1,
          };
          evaluate(false);
          return;
        }

        input.log(
          "attempt_failed",
          getLogContext({ retries: attemptContext.retries })
        );
        pendingVerification = null;
        if (isRequestAttempt && currentRequest) {
          input.warn({
            agentId: input.getAgentId(),
            reason: currentRequest.reason,
          });
        }
        setBlockedReason(
          isRequestAttempt ? "waiting_for_post_layout_verification" : null
        );
      },
    });
  };

  const runAttempt = (animated: boolean) => {
    const attemptContext: AttemptContext = {
      requestId: pendingRequest?.id ?? null,
      retries: pendingVerification?.retries ?? 0,
    };
    pendingVerification = attemptContext;
    input.log(
      "attempt_started",
      getLogContext({ animated, retries: attemptContext.retries })
    );
    input.scrollToBottom(animated);
    scheduleVerification(attemptContext);
    setBlockedReason(
      deriveBottomAnchorBlockedReason({
        pendingRequest,
        isAuthoritativeHistoryReady: input.getIsAuthoritativeHistoryReady(),
        measurementState: input.getMeasurementState(),
        pendingVerificationRequestId: attemptContext.requestId,
      })
    );
  };

  const evaluate = (animated: boolean) => {
    if (attemptHandle) {
      return;
    }
    attemptHandle = input.scheduleFrame({
      kind: "attempt",
      callback: () => {
        attemptHandle = null;
        const nextBlockedReason = deriveBottomAnchorBlockedReason({
          pendingRequest,
          isAuthoritativeHistoryReady: input.getIsAuthoritativeHistoryReady(),
          measurementState: input.getMeasurementState(),
          pendingVerificationRequestId: pendingVerification?.requestId ?? null,
        });
        setBlockedReason(nextBlockedReason);

        const shouldAttemptForPendingRequest =
          pendingRequest !== null && nextBlockedReason === null;
        const shouldAttemptForStickyVerification =
          mode === "sticky-bottom" &&
          pendingVerification !== null &&
          nextBlockedReason === null;

        if (
          !shouldAttemptForPendingRequest &&
          !shouldAttemptForStickyVerification
        ) {
          return;
        }

        runAttempt(animated);
      },
    });
  };

  const createRequest = (request: BottomAnchorRouteRequest | BottomAnchorLocalRequest) => {
    const existing = pendingRequest;
    if (existing) {
      input.log(
        "request_cancelled",
        getLogContext({
          cancelledRequestReason: existing.reason,
          cancelReason: "replaced_by_new_request",
        })
      );
    }

    cancelPendingAttempt();
    const nextRequest: BottomAnchorRequest = {
      id: requestSequence + 1,
      agentId: request.agentId,
      reason: request.reason,
      requestKey:
        "requestKey" in request
          ? request.requestKey
          : `${request.agentId}:${request.reason}:${requestSequence + 1}`,
    };
    requestSequence = nextRequest.id;
    pendingRequest = nextRequest;
    pendingVerification = null;
    setModeInternal(
      "requestKey" in request
        ? "sticky-bottom"
        : __private__.deriveModeForLocalRequest({ reason: request.reason })
    );
    input.log(
      "request_created",
      getLogContext({ requestReason: request.reason })
    );
    evaluate(request.reason === "jump-to-bottom");
  };

  return {
    destroy() {
      cancelPendingAttempt();
    },
    getSnapshot() {
      return {
        mode,
        pendingRequest,
        pendingVerification,
        blockedReason,
      };
    },
    resetForAgent() {
      lastRouteRequestKey = null;
      pendingRequest = null;
      blockedReason = null;
      cancelPendingAttempt();
      stickyMeasurementRevision = 0;
      lastVerifiedStickyMeasurementRevision = 0;
      mode = "sticky-bottom";
      input.onModeChange("sticky-bottom");
    },
    applyRouteRequest(request) {
      if (!request) {
        return;
      }
      if (lastRouteRequestKey === request.requestKey) {
        return;
      }
      lastRouteRequestKey = request.requestKey;
      createRequest(request);
    },
    requestLocalAnchor(request) {
      createRequest(request);
    },
    detachByUser() {
      if (mode === "detached") {
        return;
      }
      cancelPendingRequest("user_scrolled_away");
      setModeInternal("detached");
      input.log("detached_by_user", getLogContext());
    },
    handleViewportMetricsChange(params) {
      if (
        params.previousViewportWidth !== params.viewportWidth ||
        params.previousViewportHeight !== params.viewportHeight
      ) {
        markStickyMeasurementChanged();
      }
      const shouldRestick = __private__.shouldRestickOnViewportChange({
        mode,
        previousViewportWidth: params.previousViewportWidth,
        viewportWidth: params.viewportWidth,
        previousViewportHeight: params.previousViewportHeight,
        viewportHeight: params.viewportHeight,
      });
      if (shouldRestick && !pendingRequest) {
        pendingVerification = { requestId: null, retries: 0 };
      }
      if (shouldRestick || pendingRequest) {
        evaluate(false);
      }
    },
    handleContentSizeChange(params) {
      if (params.previousContentHeight !== params.contentHeight) {
        markStickyMeasurementChanged();
      }
      const shouldRestick = __private__.shouldRestickOnContentChange({
        mode,
        previousContentHeight: params.previousContentHeight,
        contentHeight: params.contentHeight,
      });
      if (shouldRestick && !pendingRequest) {
        pendingVerification = { requestId: null, retries: 0 };
      }
      if (shouldRestick || pendingRequest) {
        evaluate(false);
      }
    },
    prepareForStickyViewportChange() {
      if (mode !== "sticky-bottom") {
        return;
      }
      markStickyMeasurementChanged();
    },
    prepareForStickyContentChange() {
      if (mode !== "sticky-bottom") {
        return;
      }
      markStickyMeasurementChanged();
    },
    handleScrollNearBottomChange(params) {
      const { nextIsNearBottom, scrollDelta } = params;
      if (
        nextIsNearBottom &&
        mode === "sticky-bottom" &&
        stickyMeasurementRevision !== lastVerifiedStickyMeasurementRevision
      ) {
        markStickyMeasurementVerified();
      }
      const hasUnverifiedStickyMeasurementChange =
        stickyMeasurementRevision !== lastVerifiedStickyMeasurementRevision;
      if (
        __private__.shouldDetachFromScrollAway({
          mode,
          nextIsNearBottom,
          scrollDelta,
          hasPendingRequest: pendingRequest !== null,
          hasPendingVerification: pendingVerification !== null,
          hasUnverifiedStickyMeasurementChange,
        })
      ) {
        this.detachByUser();
        return;
      }
      if (
        mode === "sticky-bottom" &&
        !nextIsNearBottom &&
        hasUnverifiedStickyMeasurementChange
      ) {
        if (!pendingRequest && !pendingVerification) {
          pendingVerification = { requestId: null, retries: 0 };
        }
        evaluate(false);
        return;
      }
      if (nextIsNearBottom && pendingRequest) {
        evaluate(false);
      }
    },
    notifyAuthoritativeHistoryMaybeChanged() {
      if (!pendingVerification && !pendingRequest) {
        return;
      }
      evaluate(false);
    },
    reevaluate(animated = false) {
      evaluate(animated);
    },
  };
}

export const __private__ = {
  createBottomAnchorControllerDriver,
  deriveBottomAnchorBlockedReason,
  deriveVerificationBlockedReason,
  deriveRetryDisposition,
  deriveModeForLocalRequest(input: {
    reason: BottomAnchorLocalRequest["reason"];
  }): BottomAnchorMode {
    return "sticky-bottom";
  },
  shouldRestickOnViewportChange(input: {
    mode: BottomAnchorMode;
    previousViewportWidth: number;
    viewportWidth: number;
    previousViewportHeight: number;
    viewportHeight: number;
  }): boolean {
    return (
      input.mode === "sticky-bottom" &&
      ((input.previousViewportHeight > 0 &&
        input.viewportHeight > 0 &&
        input.previousViewportHeight !== input.viewportHeight) ||
        (input.previousViewportWidth > 0 &&
          input.viewportWidth > 0 &&
          input.previousViewportWidth !== input.viewportWidth))
    );
  },
  shouldRestickOnContentChange(input: {
    mode: BottomAnchorMode;
    previousContentHeight: number;
    contentHeight: number;
  }): boolean {
    return (
      input.mode === "sticky-bottom" &&
      input.previousContentHeight > 0 &&
      input.contentHeight > input.previousContentHeight
    );
  },
  shouldDetachFromScrollAway(input: {
    mode: BottomAnchorMode;
    nextIsNearBottom: boolean;
    scrollDelta: number;
    hasPendingRequest: boolean;
    hasPendingVerification: boolean;
    hasUnverifiedStickyMeasurementChange: boolean;
  }): boolean {
    const scrolledAwayIntentionally =
      Math.abs(input.scrollDelta) >= USER_SCROLL_AWAY_DELTA_PX;
    return (
      input.mode === "sticky-bottom" &&
      !input.nextIsNearBottom &&
      !input.hasPendingRequest &&
      !input.hasPendingVerification &&
      (!input.hasUnverifiedStickyMeasurementChange || scrolledAwayIntentionally)
    );
  },
};

export function useBottomAnchorController(input: {
  agentId: string;
  routeRequest: BottomAnchorRouteRequest | null;
  isAuthoritativeHistoryReady: boolean;
  renderStrategy: string;
  transportBehavior: BottomAnchorTransportBehavior;
  getMeasurementState: () => ControllerMeasurementState;
  isNearBottom: () => boolean;
  scrollToBottom: (animated: boolean) => void;
}) {
  const [mode, setMode] = useState<BottomAnchorMode>("sticky-bottom");
  const agentIdRef = useRef(input.agentId);
  const readinessRef = useRef(input.isAuthoritativeHistoryReady);
  const renderStrategyRef = useRef(input.renderStrategy);
  const transportBehaviorRef = useRef(input.transportBehavior);
  const getMeasurementStateRef = useRef(input.getMeasurementState);
  const isNearBottomRef = useRef(input.isNearBottom);
  const scrollToBottomRef = useRef(input.scrollToBottom);
  const driverRef = useRef<BottomAnchorControllerDriver | null>(null);

  agentIdRef.current = input.agentId;
  readinessRef.current = input.isAuthoritativeHistoryReady;
  renderStrategyRef.current = input.renderStrategy;
  transportBehaviorRef.current = input.transportBehavior;
  getMeasurementStateRef.current = input.getMeasurementState;
  isNearBottomRef.current = input.isNearBottom;
  scrollToBottomRef.current = input.scrollToBottom;

  if (!driverRef.current) {
    driverRef.current = __private__.createBottomAnchorControllerDriver({
      getAgentId: () => agentIdRef.current,
      getIsAuthoritativeHistoryReady: () => readinessRef.current,
      getRenderStrategy: () => renderStrategyRef.current,
      getTransportBehavior: () => transportBehaviorRef.current,
      getMeasurementState: () => getMeasurementStateRef.current(),
      isNearBottom: () => isNearBottomRef.current(),
      scrollToBottom: (animated) => scrollToBottomRef.current(animated),
      onModeChange: (nextMode) => setMode(nextMode),
      log: (event, details) => logBottomAnchorEvent(event, details),
      warn: (details) => {
        console.warn("[BottomAnchor] request could not be fulfilled", details);
      },
      scheduleFrame: ({ callback, delayFrames }) =>
        scheduleAnimationFrameWithDelay({ callback, delayFrames }),
      cancelFrame: (handle) => cancelScheduledAnimationFrame(handle),
    });
  }

  useEffect(() => {
    driverRef.current?.resetForAgent();
  }, [input.agentId]);

  useEffect(() => {
    driverRef.current?.applyRouteRequest(input.routeRequest);
  }, [input.routeRequest]);

  useEffect(() => {
    driverRef.current?.notifyAuthoritativeHistoryMaybeChanged();
  }, [input.isAuthoritativeHistoryReady]);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  return {
    mode,
    requestLocalAnchor(request: BottomAnchorLocalRequest) {
      driverRef.current?.requestLocalAnchor(request);
    },
    detachByUser() {
      driverRef.current?.detachByUser();
    },
    handleViewportLayout() {},
    handleViewportMetricsChange(params: {
      previousViewportWidth: number;
      viewportWidth: number;
      previousViewportHeight: number;
      viewportHeight: number;
    }) {
      driverRef.current?.handleViewportMetricsChange(params);
    },
    handleContentSizeChange(params: {
      previousContentHeight: number;
      contentHeight: number;
    }) {
      driverRef.current?.handleContentSizeChange(params);
    },
    prepareForStickyViewportChange() {
      driverRef.current?.prepareForStickyViewportChange();
    },
    prepareForStickyContentChange() {
      driverRef.current?.prepareForStickyContentChange();
    },
    handleScrollNearBottomChange(params: {
      nextIsNearBottom: boolean;
      scrollDelta: number;
    }) {
      driverRef.current?.handleScrollNearBottomChange(params);
    },
    reevaluate(animated = false) {
      driverRef.current?.reevaluate(animated);
    },
  };
}
