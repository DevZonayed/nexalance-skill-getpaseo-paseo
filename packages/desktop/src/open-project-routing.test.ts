import os from "node:os";
import path from "node:path";
import { mkdirSync, mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOpenProjectPathFromArgv } from "./open-project-routing";

describe("open-project-routing", () => {
  it("keeps CLI flags out of project-open mode", () => {
    expect(
      parseOpenProjectPathFromArgv({
        argv: ["/Applications/Paseo.app/Contents/MacOS/Paseo", "--version"],
        isDefaultApp: false,
        cwd: process.cwd(),
      }),
    ).toBeNull();
  });

  it("resolves a lone existing directory argument to an absolute project path", () => {
    const parentDir = mkdtempSync(path.join(os.tmpdir(), "paseo-desktop-open-"));
    const projectDir = path.join(parentDir, "project");
    mkdirSync(projectDir);

    expect(
      parseOpenProjectPathFromArgv({
        argv: ["/Applications/Paseo.app/Contents/MacOS/Paseo", "project"],
        isDefaultApp: false,
        cwd: parentDir,
      }),
    ).toBe(projectDir);
  });

  it("keeps known CLI commands in passthrough mode even if a directory matches", () => {
    const parentDir = mkdtempSync(path.join(os.tmpdir(), "paseo-desktop-command-"));
    mkdirSync(path.join(parentDir, "status"));

    expect(
      parseOpenProjectPathFromArgv({
        argv: ["/Applications/Paseo.app/Contents/MacOS/Paseo", "status"],
        isDefaultApp: false,
        cwd: parentDir,
      }),
    ).toBeNull();
  });
});
