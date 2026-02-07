import type { AgentPermissionRequest } from "./agent/agent-sdk-types.js";
import { isSpeakToolName } from "./agent/tool-name-normalization.js";

const SPEAK_TOKEN_SET = ["speak"];
const DENIED_TOKEN_SET = [
  "bash",
  "shell",
  "terminal",
  "apply_patch",
  "edit",
  "read_file",
  "write_file",
  "delete_file",
  "web_search",
  "fetch_url",
  "create_agent",
  "list_agents",
  "kill_agent",
  "wait_for_agent",
];

function containsAny(text: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

function stringifyMetadata(metadata: unknown): string {
  try {
    return JSON.stringify(metadata ?? {})?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}

/** Voice assistant policy: only allow the speak tool. */
export function isVoicePermissionAllowed(request: AgentPermissionRequest): boolean {
  if (request.kind !== "tool") {
    return false;
  }

  const normalizedName = request.name.trim().toLowerCase();
  if (!normalizedName) {
    return false;
  }

  if (isSpeakToolName(normalizedName)) {
    return true;
  }

  const metadataText = stringifyMetadata({
    name: request.name,
    title: request.title ?? null,
    description: request.description ?? null,
    metadata: request.metadata ?? null,
    input: request.input ?? null,
  });
  if (!metadataText) {
    return false;
  }

  const mentionsAllowedTooling = containsAny(metadataText, ALLOWED_TOKEN_SET);
  const mentionsDeniedTooling = containsAny(metadataText, DENIED_TOKEN_SET);
  return mentionsAllowedTooling && !mentionsDeniedTooling;
}
