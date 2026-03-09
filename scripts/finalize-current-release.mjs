import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const rootPackagePath = path.join(rootDir, "package.json");

function usageAndExit(code = 0) {
  process.stderr.write(`Usage: node scripts/finalize-current-release.mjs\n`);
  process.exit(code);
}

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: rootDir, stdio: "inherit" });
}

function runQuiet(cmd, args) {
  return execFileSync(cmd, args, { cwd: rootDir, encoding: "utf8" }).trim();
}

function parseRepoSlug(remoteUrl) {
  const trimmed = remoteUrl.trim().replace(/\.git$/, "");
  const httpsMatch = trimmed.match(/github\.com[/:]([^/]+\/[^/]+)$/);
  if (httpsMatch) {
    return httpsMatch[1];
  }
  throw new Error(`Could not determine GitHub repo from origin URL: ${remoteUrl}`);
}

if (process.argv.length > 2) {
  const arg = process.argv[2];
  if (arg === "--help" || arg === "-h") {
    usageAndExit(0);
  }
  usageAndExit(1);
}

const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8"));
const version = typeof rootPackage.version === "string" ? rootPackage.version.trim() : "";
if (!version) {
  throw new Error('Root package.json must contain a valid "version"');
}

const tag = `v${version}`;
const repo = parseRepoSlug(runQuiet("git", ["remote", "get-url", "origin"]));
const releaseJson = runQuiet("gh", [
  "release",
  "view",
  tag,
  "--repo",
  repo,
  "--json",
  "isDraft,tagName,url",
]);
const release = JSON.parse(releaseJson);

if (!release.isDraft) {
  throw new Error(`Release ${tag} is already published. Refusing to finalize a non-draft release.`);
}

run("npm", ["run", "release:publish"]);
run("gh", ["release", "edit", tag, "--repo", repo, "--draft=false"]);

console.log(`Finalized release ${tag}: npm packages published and GitHub draft release promoted.`);
