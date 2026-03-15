import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  findExecutable,
  resolveProviderCommandPrefix,
  applyProviderEnv,
  type ProviderRuntimeSettings,
} from "./provider-launch-config.js";

type FindExecutableDependencies = NonNullable<Parameters<typeof findExecutable>[1]>;

function createFindExecutableDependencies(): FindExecutableDependencies {
  return {
    execFileSync: vi.fn(),
    execSync: vi.fn(),
    existsSync: vi.fn(),
    platform: vi.fn(() => "darwin"),
    shell: undefined,
  };
}

let findExecutableDependencies: FindExecutableDependencies;

beforeEach(() => {
  findExecutableDependencies = createFindExecutableDependencies();
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

    const env = applyProviderEnv(base, runtime, {});

    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/custom/home");
    expect(env.FOO).toBe("bar");
    expect(Object.keys(env).length).toBeGreaterThanOrEqual(3);
  });
});

describe("findExecutable", () => {
  test("uses the last line from login-shell which output", () => {
    findExecutableDependencies.shell = "/bin/zsh";
    findExecutableDependencies.execSync.mockReturnValue(
      "echo from profile\n/usr/local/bin/codex\n"
    );

    expect(findExecutable("codex", findExecutableDependencies)).toBe(
      "/usr/local/bin/codex"
    );
    expect(findExecutableDependencies.execSync).toHaveBeenCalledOnce();
    expect(findExecutableDependencies.execFileSync).not.toHaveBeenCalled();
  });

  test("warns and returns null when the final which line is not an absolute path", () => {
    findExecutableDependencies.shell = "/bin/zsh";
    findExecutableDependencies.execSync.mockReturnValue("profile noise\ncodex\n");
    findExecutableDependencies.execFileSync.mockReturnValue("codex\n");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(findExecutable("codex", findExecutableDependencies)).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  test("returns direct paths when they exist", () => {
    findExecutableDependencies.existsSync.mockReturnValue(true);

    expect(findExecutable("/usr/local/bin/codex", findExecutableDependencies)).toBe(
      "/usr/local/bin/codex"
    );
    expect(findExecutableDependencies.existsSync).toHaveBeenCalledWith(
      "/usr/local/bin/codex"
    );
  });
});
