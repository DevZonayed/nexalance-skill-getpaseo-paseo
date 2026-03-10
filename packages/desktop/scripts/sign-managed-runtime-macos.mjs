import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(new URL("../../..", import.meta.url).pathname);
const desktopRoot = path.join(repoRoot, "packages", "desktop");
const resourcesRoot = path.join(desktopRoot, "src-tauri", "resources", "managed-runtime");
const signingIdentity = process.env.APPLE_SIGNING_IDENTITY;

if (process.platform !== "darwin") {
  throw new Error("sign-managed-runtime-macos.mjs can only run on macOS.");
}

if (!signingIdentity) {
  throw new Error("APPLE_SIGNING_IDENTITY is required to sign the managed runtime.");
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root) {
  const files = [];
  async function walk(current) {
    const stat = await fs.stat(current);
    if (stat.isDirectory()) {
      const children = await fs.readdir(current);
      children.sort();
      for (const child of children) {
        await walk(path.join(current, child));
      }
      return;
    }
    files.push(current);
  }
  await walk(root);
  return files;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return result.stdout.trim();
}

function getFileKind(target) {
  return run("file", ["-b", target]);
}

function isMachO(fileKind) {
  return fileKind.includes("Mach-O");
}

function needsHardenedRuntime(fileKind) {
  return fileKind.includes("executable");
}

async function main() {
  const pointer = JSON.parse(
    await fs.readFile(path.join(resourcesRoot, "current-runtime.json"), "utf8")
  );
  const runtimeRoot = path.join(resourcesRoot, pointer.relativeRoot);
  if (!(await pathExists(runtimeRoot))) {
    throw new Error(`Managed runtime root does not exist: ${runtimeRoot}`);
  }

  const files = await walkFiles(runtimeRoot);
  const signTargets = [];
  for (const file of files) {
    const fileKind = getFileKind(file);
    if (!isMachO(fileKind)) {
      continue;
    }
    signTargets.push({
      file,
      needsRuntime: needsHardenedRuntime(fileKind),
    });
  }

  signTargets.sort((left, right) => left.file.localeCompare(right.file));

  for (const target of signTargets) {
    const args = [
      "--force",
      "--sign",
      signingIdentity,
      "--timestamp",
    ];
    if (target.needsRuntime) {
      args.push("--options", "runtime");
    }
    args.push(target.file);
    console.log(`[managed-runtime-sign] ${path.relative(repoRoot, target.file)}`);
    run("codesign", args);
  }
}

await main();
