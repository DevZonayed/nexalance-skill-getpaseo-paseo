const TOOL_TOKEN_REGEX = /[a-z0-9]+/g;
const NAMESPACE_SEPARATOR_REGEX = /[.:/]|__/;

export function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

export function tokenizeToolName(name: string): string[] {
  const normalized = normalizeToolName(name);
  return normalized.match(TOOL_TOKEN_REGEX) ?? [];
}

export function getToolLeafName(name: string): string | null {
  const tokens = tokenizeToolName(name);
  return tokens.length > 0 ? tokens[tokens.length - 1]! : null;
}

export function isSpeakToolName(name: string): boolean {
  return getToolLeafName(name) === "speak";
}

export function isLikelyNamespacedToolName(name: string): boolean {
  return NAMESPACE_SEPARATOR_REGEX.test(normalizeToolName(name));
}

export function isLikelyExternalToolName(name: string): boolean {
  const normalized = normalizeToolName(name);
  if (!normalized) {
    return false;
  }
  if (isSpeakToolName(normalized)) {
    return true;
  }
  return isLikelyNamespacedToolName(normalized);
}
