import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

import { spawnProcess } from "./spawn.js";

type SpawnResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error: Error | null;
};

const tempDirs: string[] = [];
const JSON_ARG = '{"key":"value with spaces","nested":{"quote":"\\"yes\\""}}';

function makeFixture(): {
  root: string;
  fakeDaemonNode: string;
  shim: string;
  assertScript: string;
  expectedArgs: string[];
} {
  const root = mkdtempSync(path.join(tmpdir(), "paseo spawn regression "));
  tempDirs.push(root);

  const fakeDaemonNode = path.join(root, "Fake Paseo.exe");
  copyFileSync(process.execPath, fakeDaemonNode);

  const expectedArgs = ["--config", JSON_ARG];
  const assertScript = path.join(root, "assert-argv.js");
  writeFileSync(
    assertScript,
    `
const expected = JSON.parse(process.env.PASEO_EXPECTED_ARGV_JSON);
const actual = process.argv.slice(2);
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error("ARGV_MISMATCH");
  console.error(JSON.stringify({ expected, actual }));
  process.exit(42);
}
console.log("ARGV_OK");
`,
  );

  const shim = path.join(root, "claude.cmd");
  writeFileSync(
    shim,
    ["@echo off", "setlocal", `\"${fakeDaemonNode}\" \"${assertScript}\" %*`, ""].join("\r\n"),
  );

  return { root, fakeDaemonNode, shim, assertScript, expectedArgs };
}

function collectChild(child: ChildProcess, timeoutMs = 10_000): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let error: Error | null = null;
    let settled = false;

    const settle = (result: Pick<SpawnResult, "code" | "signal">) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        error,
      });
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle({ code: null, signal: "SIGKILL" });
    }, timeoutMs);
    timer.unref?.();

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.once("error", (err) => {
      error = err;
      settle({ code: null, signal: null });
    });
    child.once("exit", (code, signal) => {
      settle({ code, signal });
    });
  });
}

async function runFixture(params: {
  command: string;
  args: string[];
  shell?: boolean;
}): Promise<SpawnResult> {
  const child = spawnProcess(params.command, params.args, {
    env: {
      ...process.env,
      PASEO_EXPECTED_ARGV_JSON: JSON.stringify(["--config", JSON_ARG]),
    },
    stdio: ["ignore", "pipe", "pipe"],
    ...(params.shell === undefined ? {} : { shell: params.shell }),
  });
  return collectChild(child);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe.runIf(process.platform === "win32")("Windows spawn launch regression", () => {
  test("launches a cmd shim from a path with spaces without corrupting JSON args", async () => {
    const fixture = makeFixture();

    const result = await runFixture({
      command: fixture.shim,
      args: fixture.expectedArgs,
    });

    expect(result.error).toBeNull();
    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe("ARGV_OK");
  });

  test("launches a cmd shim even when the caller explicitly disables shell", async () => {
    const fixture = makeFixture();

    const result = await runFixture({
      command: fixture.shim,
      args: fixture.expectedArgs,
      shell: false,
    });

    expect(result.error).toBeNull();
    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe("ARGV_OK");
  });

  test("direct launch with a space-containing executable preserves JSON args", async () => {
    const fixture = makeFixture();

    const result = await runFixture({
      command: fixture.fakeDaemonNode,
      args: [fixture.assertScript, ...fixture.expectedArgs],
      shell: false,
    });

    expect(result.error).toBeNull();
    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe("ARGV_OK");
  });
});

describe.skipIf(process.platform === "win32")("spawn launch regression smoke", () => {
  test("direct launch with a space-containing executable works on this platform", async () => {
    const fixture = makeFixture();

    const result = await runFixture({
      command: fixture.fakeDaemonNode,
      args: [fixture.assertScript, ...fixture.expectedArgs],
      shell: false,
    });

    expect(result.error).toBeNull();
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe("ARGV_OK");
  });
});
