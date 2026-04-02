import { existsSync } from "node:fs";

import type {
  AgentCapabilityFlags,
  AgentClient,
  AgentLaunchContext,
  AgentModelDefinition,
  AgentPersistenceHandle,
  AgentSession,
  AgentSessionConfig,
  ListModelsOptions,
} from "../agent-sdk-types.js";
import {
  findExecutable,
  isProviderCommandAvailable,
  type ProviderRuntimeSettings,
} from "../provider-launch-config.js";

const GEMINI_PROVIDER = "gemini" as const;

const GEMINI_CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: false,
  supportsSessionPersistence: false,
  supportsDynamicModes: false,
  supportsMcpServers: false,
  supportsReasoningStream: false,
  supportsToolInvocations: false,
};

function resolveGeminiBinary(): string {
  const found = findExecutable("gemini");
  if (found) {
    return found;
  }
  throw new Error(
    "Gemini CLI binary not found. Install Gemini CLI and ensure 'gemini' is available in your shell PATH.",
  );
}

function createUnsupportedSessionError(): Error {
  return new Error("Gemini CLI does not support session-backed agents in Paseo.");
}

export class GeminiAgentClient implements AgentClient {
  readonly provider = GEMINI_PROVIDER;
  readonly capabilities = GEMINI_CAPABILITIES;

  constructor(private readonly runtimeSettings?: ProviderRuntimeSettings) {}

  async createSession(
    _config: AgentSessionConfig,
    _launchContext?: AgentLaunchContext,
  ): Promise<AgentSession> {
    throw createUnsupportedSessionError();
  }

  async resumeSession(
    _handle: AgentPersistenceHandle,
    _overrides?: Partial<AgentSessionConfig>,
    _launchContext?: AgentLaunchContext,
  ): Promise<AgentSession> {
    throw createUnsupportedSessionError();
  }

  async listModels(_options?: ListModelsOptions): Promise<AgentModelDefinition[]> {
    return [];
  }

  async isAvailable(): Promise<boolean> {
    if (this.runtimeSettings?.command?.mode === "replace") {
      return existsSync(this.runtimeSettings.command.argv[0]);
    }
    return isProviderCommandAvailable(this.runtimeSettings?.command, resolveGeminiBinary);
  }
}
