import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const rootPackagePath = path.join(rootDir, "package.json");

function usageAndExit(code = 0) {
  process.stderr.write(`Usage: node scripts/push-current-release-tag.mjs [--draft-release]\n`);
  process.exit(code);
}

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: rootDir, stdio: "inherit" });
}

function runQuiet(cmd, args) {
  return execFileSync(cmd, args, { cwd: rootDir, encoding: "utf8" }).trim();
}

function parseArgs(argv) {
  const args = { draftRelease: false };

  for (const arg of argv) {
    if (arg === "--draft-release") {
      args.draftRelease = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usageAndExit(0);
    }
    usageAndExit(1);
  }

  return args;
}

function parseRepoSlug(remoteUrl) {
  const trimmed = remoteUrl.trim().replace(/\.git$/, "");
  const httpsMatch = trimmed.match(/github\.com[/:]([^/]+\/[^/]+)$/);
  if (httpsMatch) {
    return httpsMatch[1];
  }
  throw new Error(`Could not determine GitHub repo from origin URL: ${remoteUrl}`);
}

const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8"));
const version = typeof rootPackage.version === "string" ? rootPackage.version.trim() : "";
if (!version) {
  throw new Error('Root package.json must contain a valid "version"');
}

const args = parseArgs(process.argv.slice(2));
const tag = `v${version}`;
const headCommit = runQuiet("git", ["rev-parse", "HEAD"]);

let localTagCommit = "";
try {
  localTagCommit = runQuiet("git", ["rev-list", "-n", "1", tag]);
} catch {
  run("git", ["tag", "-a", tag, "-m", tag]);
  localTagCommit = runQuiet("git", ["rev-list", "-n", "1", tag]);
}

if (localTagCommit !== headCommit) {
  throw new Error(
    `Local tag ${tag} points to ${localTagCommit}, but HEAD is ${headCommit}. ` +
      "Create a new release commit before pushing this tag.",
  );
}

run("git", ["push", "origin", "HEAD"]);

let remoteTagExists = false;
try {
  runQuiet("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`]);
  remoteTagExists = true;
} catch {
  remoteTagExists = false;
}

if (remoteTagExists) {
  console.log(`Tag ${tag} already exists on origin`);
} else {
  run("git", ["push", "origin", tag]);
}

if (args.draftRelease) {
  const repo = parseRepoSlug(runQuiet("git", ["remote", "get-url", "origin"]));
  run("node", [
    path.join("scripts", "sync-release-notes-from-changelog.mjs"),
    "--repo",
    repo,
    "--tag",
    tag,
    "--create-if-missing",
    "--draft",
  ]);
}

console.log(`Release push complete: branch HEAD and tag ${tag}`);
