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

const AIDER_PROVIDER = "aider" as const;

const AIDER_CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: false,
  supportsSessionPersistence: false,
  supportsDynamicModes: false,
  supportsMcpServers: false,
  supportsReasoningStream: false,
  supportsToolInvocations: false,
};

function resolveAiderBinary(): string {
  const found = findExecutable("aider");
  if (found) {
    return found;
  }
  throw new Error(
    "Aider binary not found. Install Aider and ensure 'aider' is available in your shell PATH.",
  );
}

function createUnsupportedSessionError(): Error {
  return new Error("Aider does not support session-backed agents in Paseo.");
}

export class AiderAgentClient implements AgentClient {
  readonly provider = AIDER_PROVIDER;
  readonly capabilities = AIDER_CAPABILITIES;

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
    return isProviderCommandAvailable(this.runtimeSettings?.command, resolveAiderBinary);
  }
}
