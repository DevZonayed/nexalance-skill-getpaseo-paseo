import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type VoiceMcpBridgeCommand = { command: string; baseArgs: string[] };

const DEFAULT_BRIDGE_SCRIPT_RELATIVE_URL = "../../scripts/mcp-stdio-socket-bridge-cli.mjs";

export function resolveVoiceMcpBridgeScriptPath(params: {
  bootstrapModuleUrl: string;
  explicitScriptPath?: string | null;
}): string {
  const explicitScriptPath = params.explicitScriptPath?.trim();
  if (explicitScriptPath) {
    if (!existsSync(explicitScriptPath)) {
      throw new Error(
        `MCP stdio-socket bridge script not found at configured path: ${explicitScriptPath}`
      );
    }
    return explicitScriptPath;
  }

  const scriptPath = fileURLToPath(
    new URL(DEFAULT_BRIDGE_SCRIPT_RELATIVE_URL, params.bootstrapModuleUrl)
  );
  if (!existsSync(scriptPath)) {
    throw new Error(`MCP stdio-socket bridge script not found: ${scriptPath}`);
  }
  return scriptPath;
}

export function resolveVoiceMcpBridgeFromRuntime(params: {
  bootstrapModuleUrl: string;
  execPath: string;
  explicitScriptPath?: string | null;
}): {
  resolved: VoiceMcpBridgeCommand;
  source: string;
} {
  const scriptPath = resolveVoiceMcpBridgeScriptPath({
    bootstrapModuleUrl: params.bootstrapModuleUrl,
    explicitScriptPath: params.explicitScriptPath,
  });
  return {
    source: params.explicitScriptPath?.trim() ? "explicit-js-script" : "default-js-script",
    resolved: {
      command: params.execPath,
      baseArgs: [scriptPath],
    },
  };
}
