import { describe, expect, it } from "vitest";
import { buildScriptHostname } from "./script-hostname.js";

describe("buildScriptHostname", () => {
  it("slugifies script names with spaces on default branches", () => {
    expect(buildScriptHostname(null, "npm run dev")).toBe("npm-run-dev.localhost");
  });

  it("slugifies script names with special characters", () => {
    expect(buildScriptHostname(null, "Web/API @ Dev")).toBe("web-api-dev.localhost");
  });

  it("omits the branch prefix for main and master", () => {
    expect(buildScriptHostname("main", "npm run dev")).toBe("npm-run-dev.localhost");
    expect(buildScriptHostname("master", "npm run dev")).toBe("npm-run-dev.localhost");
  });

  it("adds a slugified branch prefix for non-default branches", () => {
    expect(buildScriptHostname("feature/cool stuff", "api")).toBe(
      "feature-cool-stuff.api.localhost",
    );
  });

  it("slugifies both the branch name and script name together", () => {
    expect(buildScriptHostname("feat/add auth", "npm run dev")).toBe(
      "feat-add-auth.npm-run-dev.localhost",
    );
  });
});
