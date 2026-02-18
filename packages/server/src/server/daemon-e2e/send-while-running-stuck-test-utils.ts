import type { AgentSnapshotPayload } from "../messages.js";

export function applyAgentInputProcessingTransition(input: {
  snapshot: AgentSnapshotPayload;
  currentIsProcessing: boolean;
  previousIsRunning: boolean;
  latestUpdatedAt: number;
}): { isProcessing: boolean; previousIsRunning: boolean; latestUpdatedAt: number } {
  const updatedAt = new Date(input.snapshot.updatedAt).getTime();
  if (updatedAt < input.latestUpdatedAt) {
    return {
      isProcessing: input.currentIsProcessing,
      previousIsRunning: input.previousIsRunning,
      latestUpdatedAt: input.latestUpdatedAt,
    };
  }

  const isRunning = input.snapshot.status === "running";
  const wasRunning = input.previousIsRunning;
  let isProcessing = input.currentIsProcessing;

  if (isProcessing) {
    const hasEnteredRunning = !wasRunning && isRunning;
    const hasFreshRunningUpdateWhileRunning =
      wasRunning && isRunning && updatedAt > input.latestUpdatedAt;
    const hasStoppedRunning = wasRunning && !isRunning;

    if (
      hasEnteredRunning ||
      hasFreshRunningUpdateWhileRunning ||
      hasStoppedRunning
    ) {
      isProcessing = false;
    }
  }

  return {
    isProcessing,
    previousIsRunning: isRunning,
    latestUpdatedAt: updatedAt,
  };
}
