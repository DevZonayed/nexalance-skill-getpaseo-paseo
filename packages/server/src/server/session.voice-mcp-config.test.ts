import { describe, expect, test } from "vitest";

import { buildVoiceAgentMcpServerConfig } from "./session.js";

describe("voice MCP stdio config", () => {
  test("builds stdio MCP config for voice agent", () => {
    const config = buildVoiceAgentMcpServerConfig({
      command: "/usr/local/bin/node",
      baseArgs: ["/tmp/mcp-stdio-socket-bridge-cli.mjs"],
      socketPath: "/tmp/paseo-voice.sock",
      env: {
        PASEO_HOME: "/tmp/paseo-home",
      },
    });

    expect(config.type).toBe("stdio");
    expect(config.command).toBe("/usr/local/bin/node");
    expect(config.args).toEqual([
      "/tmp/mcp-stdio-socket-bridge-cli.mjs",
      "--socket",
      "/tmp/paseo-voice.sock",
    ]);
    expect(config.env).toEqual({
      PASEO_HOME: "/tmp/paseo-home",
    });
  });
});
