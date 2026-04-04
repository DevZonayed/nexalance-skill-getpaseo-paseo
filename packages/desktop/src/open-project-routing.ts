import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const OPEN_PROJECT_FLAG = "--open-project";
const OPEN_PROJECT_IGNORED_ARG_PREFIXES = ["-psn_", "--no-sandbox"];
const TOP_LEVEL_CLI_COMMANDS = new Set([
  "ls",
  "run",
  "attach",
  "logs",
  "stop",
  "delete",
  "send",
  "inspect",
  "wait",
  "archive",
  "onboard",
  "start",
  "status",
  "restart",
  "agent",
  "daemon",
  "chat",
  "terminal",
  "loop",
  "schedule",
  "permit",
  "provider",
  "speech",
  "worktree",
  "help",
]);

function expandUserPath(inputPath: string): string {
  if (inputPath === "~") {
    return homedir();
  }

  if (inputPath.startsWith("~/")) {
    return path.join(homedir(), inputPath.slice(2));
  }

  return inputPath;
}

function isPathLikeArg(arg: string): boolean {
  return (
    arg === "." ||
    arg === ".." ||
    arg.startsWith("./") ||
    arg.startsWith("../") ||
    arg.startsWith("/") ||
    arg === "~" ||
    arg.startsWith("~/") ||
    /^[A-Za-z]:[\\/]/.test(arg)
  );
}

function isExistingDirectoryArg(input: { arg: string; cwd: string }): boolean {
  const absolutePath = path.resolve(input.cwd, expandUserPath(input.arg));

  if (!existsSync(absolutePath)) {
    return false;
  }

  return statSync(absolutePath).isDirectory();
}

function resolveProjectPath(input: { arg: string; cwd: string }): string {
  return path.resolve(input.cwd, expandUserPath(input.arg));
}

function getEffectiveArgs(input: { argv: string[]; isDefaultApp: boolean }): string[] {
  const startIndex = input.isDefaultApp ? 2 : 1;
  const effective: string[] = [];

  for (const arg of input.argv.slice(startIndex)) {
    if (OPEN_PROJECT_IGNORED_ARG_PREFIXES.some((prefix) => arg.startsWith(prefix))) {
      continue;
    }
    effective.push(arg);
  }

  return effective;
}

export function parseOpenProjectPathFromArgv(input: {
  argv: string[];
  isDefaultApp: boolean;
  cwd: string;
}): string | null {
  const effectiveArgs = getEffectiveArgs({
    argv: input.argv,
    isDefaultApp: input.isDefaultApp,
  });

  for (let index = 0; index < effectiveArgs.length; index += 1) {
    const arg = effectiveArgs[index];
    if (arg !== OPEN_PROJECT_FLAG) {
      break;
    }

    const pathArg = effectiveArgs[index + 1];
    return pathArg ?? null;
  }

  if (effectiveArgs.length !== 1) {
    return null;
  }

  const [arg] = effectiveArgs;
  if (arg.startsWith("-") || TOP_LEVEL_CLI_COMMANDS.has(arg)) {
    return null;
  }

  if (!isPathLikeArg(arg) && !isExistingDirectoryArg({ arg, cwd: input.cwd })) {
    return null;
  }

  if (!isExistingDirectoryArg({ arg, cwd: input.cwd })) {
    return null;
  }

  return resolveProjectPath({ arg, cwd: input.cwd });
}
