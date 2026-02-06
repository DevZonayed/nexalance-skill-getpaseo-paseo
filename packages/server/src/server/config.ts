import path from "node:path";

import type { PaseoDaemonConfig } from "./bootstrap.js";
import { loadPersistedConfig } from "./persisted-config.js";
import type { AgentProvider } from "./agent/agent-sdk-types.js";
import { AGENT_PROVIDER_IDS } from "./agent/provider-manifest.js";
import { resolveSpeechConfig } from "./speech/speech-config-resolver.js";
import {
  mergeAllowedHosts,
  parseAllowedHostsEnv,
  type AllowedHostsConfig,
} from "./allowed-hosts.js";

const DEFAULT_PORT = 6767;
const DEFAULT_RELAY_ENDPOINT = "relay.paseo.sh:443";
const DEFAULT_APP_BASE_URL = "https://app.paseo.sh";
function getDefaultListen(): string {
  // Main HTTP server defaults to TCP
  return `127.0.0.1:${DEFAULT_PORT}`;
}

export type CliConfigOverrides = Partial<{
  listen: string;
  relayEnabled: boolean;
  mcpEnabled: boolean;
  allowedHosts: AllowedHostsConfig;
}>;

function parseVoiceLlmProviderId(value: unknown): AgentProvider | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return (AGENT_PROVIDER_IDS as readonly string[]).includes(normalized)
    ? (normalized as AgentProvider)
    : null;
}

export function loadConfig(
  paseoHome: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    cli?: CliConfigOverrides;
  }
): PaseoDaemonConfig {
  const env = options?.env ?? process.env;
  const persisted = loadPersistedConfig(paseoHome);

  // PASEO_LISTEN can be:
  // - host:port (TCP)
  // - /path/to/socket (Unix socket)
  // - unix:///path/to/socket (Unix socket)
  // Default is TCP at 127.0.0.1:6767
  const listen =
    options?.cli?.listen ??
    env.PASEO_LISTEN ??
    persisted.daemon?.listen ??
    getDefaultListen();

  const envCorsOrigins = env.PASEO_CORS_ORIGINS
    ? env.PASEO_CORS_ORIGINS.split(",").map((s) => s.trim())
    : [];

  const persistedCorsOrigins = persisted.daemon?.cors?.allowedOrigins ?? [];

  const allowedHosts = mergeAllowedHosts([
    persisted.daemon?.allowedHosts,
    parseAllowedHostsEnv(env.PASEO_ALLOWED_HOSTS),
    options?.cli?.allowedHosts,
  ]);

  const mcpEnabled =
    options?.cli?.mcpEnabled ?? persisted.daemon?.mcp?.enabled ?? true;

  const relayEnabled =
    options?.cli?.relayEnabled ?? persisted.daemon?.relay?.enabled ?? true;

  const relayEndpoint =
    env.PASEO_RELAY_ENDPOINT ??
    persisted.daemon?.relay?.endpoint ??
    DEFAULT_RELAY_ENDPOINT;

  const relayPublicEndpoint =
    env.PASEO_RELAY_PUBLIC_ENDPOINT ??
    persisted.daemon?.relay?.publicEndpoint ??
    relayEndpoint;

  const appBaseUrl =
    env.PASEO_APP_BASE_URL ?? persisted.app?.baseUrl ?? DEFAULT_APP_BASE_URL;

  const { openai, speech } = resolveSpeechConfig({
    paseoHome,
    env,
    persisted,
  });

  const envVoiceLlmProvider = parseVoiceLlmProviderId(env.PASEO_VOICE_LLM_PROVIDER);
  const persistedVoiceLlmProvider = parseVoiceLlmProviderId(
    persisted.features?.voiceMode?.llm?.provider
  );
  const voiceLlmProvider = envVoiceLlmProvider ?? persistedVoiceLlmProvider ?? null;
  const voiceLlmProviderExplicit =
    envVoiceLlmProvider !== null || persistedVoiceLlmProvider !== null;
  const voiceLlmModel = persisted.features?.voiceMode?.llm?.model ?? null;

  return {
    listen,
    paseoHome,
    corsAllowedOrigins: Array.from(
      new Set([...persistedCorsOrigins, ...envCorsOrigins].filter((s) => s.length > 0))
    ),
    allowedHosts,
    mcpEnabled,
    mcpDebug: env.MCP_DEBUG === "1",
    agentStoragePath: path.join(paseoHome, "agents"),
    staticDir: "public",
    agentClients: {},
    relayEnabled,
    relayEndpoint,
    relayPublicEndpoint,
    appBaseUrl,
    openai,
    speech,
    voiceLlmProvider,
    voiceLlmProviderExplicit,
    voiceLlmModel,
  };
}
