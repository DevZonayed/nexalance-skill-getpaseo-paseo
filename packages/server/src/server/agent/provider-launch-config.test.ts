import { beforeEach, describe, expect, test, vi } from "vitest";

const { execFileSyncMock, execSyncMock, existsSyncMock, platformMock } = vi.hoisted(
  () => ({
    execFileSyncMock: vi.fn(),
    execSyncMock: vi.fn(),
    existsSyncMock: vi.fn(),
    platformMock: vi.fn(() => "darwin"),
  })
);

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
  execSync: execSyncMock,
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}));

vi.mock("node:os", () => ({
  platform: platformMock,
}));

import {
  findExecutable,
  resolveProviderCommandPrefix,
  applyProviderEnv,
  type ProviderRuntimeSettings,
} from "./provider-launch-config.js";

beforeEach(() => {
  execFileSyncMock.mockReset();
  execSyncMock.mockReset();
  existsSyncMock.mockReset();
  platformMock.mockReset();
  platformMock.mockReturnValue("darwin");
  delete process.env["SHELL"];
});

describe("resolveProviderCommandPrefix", () => {
  test("uses resolved default command in default mode", () => {
    const resolveDefault = vi.fn(() => "/usr/local/bin/claude");

    const resolved = resolveProviderCommandPrefix(undefined, resolveDefault);

    expect(resolveDefault).toHaveBeenCalledTimes(1);
    expect(resolved).toEqual({ command: "/usr/local/bin/claude", args: [] });
  });

  test("appends args in append mode", () => {
    const resolveDefault = vi.fn(() => "/usr/local/bin/claude");

    const resolved = resolveProviderCommandPrefix(
      {
        mode: "append",
        args: ["--chrome"],
      },
      resolveDefault
    );

    expect(resolveDefault).toHaveBeenCalledTimes(1);
    expect(resolved).toEqual({
      command: "/usr/local/bin/claude",
      args: ["--chrome"],
    });
  });

  test("replaces command in replace mode without resolving default", () => {
    const resolveDefault = vi.fn(() => "/usr/local/bin/claude");

    const resolved = resolveProviderCommandPrefix(
      {
        mode: "replace",
        argv: ["docker", "run", "--rm", "my-wrapper"],
      },
      resolveDefault
    );

    expect(resolveDefault).not.toHaveBeenCalled();
    expect(resolved).toEqual({
      command: "docker",
      args: ["run", "--rm", "my-wrapper"],
    });
  });
});

describe("applyProviderEnv", () => {
  test("merges provider env overrides", () => {
    const base = {
      PATH: "/usr/bin",
      HOME: "/tmp",
    };
    const runtime: ProviderRuntimeSettings = {
      env: {
        HOME: "/custom/home",
        FOO: "bar",
      },
    };

    const env = applyProviderEnv(base, runtime);

    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/custom/home",
      FOO: "bar",
    });
  });
});

describe("findExecutable", () => {
  test("uses the last line from login-shell which output", () => {
    process.env["SHELL"] = "/bin/zsh";
    execSyncMock.mockReturnValue("echo from profile\n/usr/local/bin/codex\n");

    expect(findExecutable("codex")).toBe("/usr/local/bin/codex");
    expect(execSyncMock).toHaveBeenCalledOnce();
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  test("warns and returns null when the final which line is not an absolute path", () => {
    process.env["SHELL"] = "/bin/zsh";
    execSyncMock.mockReturnValue("profile noise\ncodex\n");
    execFileSyncMock.mockReturnValue("codex\n");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(findExecutable("codex")).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  test("returns direct paths when they exist", () => {
    existsSyncMock.mockReturnValue(true);

    expect(findExecutable("/usr/local/bin/codex")).toBe("/usr/local/bin/codex");
    expect(existsSyncMock).toHaveBeenCalledWith("/usr/local/bin/codex");
  });
});
