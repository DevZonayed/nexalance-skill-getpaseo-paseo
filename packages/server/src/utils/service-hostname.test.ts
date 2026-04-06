import { describe, expect, it } from "vitest";
import { buildServiceHostname } from "./service-hostname.js";

describe("buildServiceHostname", () => {
  it("slugifies service names with spaces on default branches", () => {
    expect(buildServiceHostname(null, "npm run dev")).toBe("npm-run-dev.localhost");
  });

  it("slugifies service names with special characters", () => {
    expect(buildServiceHostname(null, "Web/API @ Dev")).toBe("web-api-dev.localhost");
  });

  it("omits the branch prefix for main and master", () => {
    expect(buildServiceHostname("main", "npm run dev")).toBe("npm-run-dev.localhost");
    expect(buildServiceHostname("master", "npm run dev")).toBe("npm-run-dev.localhost");
  });

  it("adds a slugified branch prefix for non-default branches", () => {
    expect(buildServiceHostname("feature/cool stuff", "api")).toBe(
      "feature-cool-stuff.api.localhost",
    );
  });

  it("slugifies both the branch name and service name together", () => {
    expect(buildServiceHostname("feat/add auth", "npm run dev")).toBe(
      "feat-add-auth.npm-run-dev.localhost",
    );
  });
});
