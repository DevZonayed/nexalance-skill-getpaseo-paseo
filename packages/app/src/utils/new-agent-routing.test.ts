import { describe, expect, it } from "vitest";

import type { CheckoutStatusPayload } from "@/hooks/use-checkout-status-query";
import {
  buildNewAgentRoute,
  resolveNewAgentWorkingDir,
} from "./new-agent-routing";

describe("buildNewAgentRoute", () => {
  it("falls back to host-scoped draft route when no working directory is provided", () => {
    expect(buildNewAgentRoute("srv-1", undefined)).toBe("/h/srv-1/agent");
    expect(buildNewAgentRoute("srv-1", "   ")).toBe("/h/srv-1/agent");
  });

  it("encodes the working directory query parameter", () => {
    expect(buildNewAgentRoute("srv-1", "/Users/me/dev/paseo")).toBe(
      "/h/srv-1/agent?workingDir=%2FUsers%2Fme%2Fdev%2Fpaseo"
    );
  });
});

describe("resolveNewAgentWorkingDir", () => {
  it("returns the current cwd for regular checkouts", () => {
    expect(resolveNewAgentWorkingDir("/repo/path", null)).toBe("/repo/path");
  });

  it("returns the main repo root for paseo-owned worktrees", () => {
    const checkout = {
      isPaseoOwnedWorktree: true,
      mainRepoRoot: "/repo/main",
    } as CheckoutStatusPayload;

    expect(resolveNewAgentWorkingDir("/repo/.paseo/worktrees/feature", checkout)).toBe(
      "/repo/main"
    );
  });
});
