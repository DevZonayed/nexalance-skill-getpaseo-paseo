type NullableString = string | null | undefined;

function trimNonEmpty(value: NullableString): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function parseServerIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/h\/([^/]+)(?:\/|$)/);
  if (!match) {
    return null;
  }
  const raw = match[1];
  if (!raw) {
    return null;
  }
  try {
    return trimNonEmpty(decodeURIComponent(raw));
  } catch {
    return trimNonEmpty(raw);
  }
}

export function parseHostAgentRouteFromPathname(
  pathname: string
): { serverId: string; agentId: string } | null {
  const match = pathname.match(/^\/h\/([^/]+)\/agent\/([^/]+)(?:\/|$)/);
  if (!match) {
    return null;
  }

  const [, encodedServerId, encodedAgentId] = match;
  if (!encodedServerId || !encodedAgentId) {
    return null;
  }

  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const serverId = trimNonEmpty(decode(encodedServerId));
  const agentId = trimNonEmpty(decode(encodedAgentId));
  if (!serverId || !agentId) {
    return null;
  }

  return { serverId, agentId };
}

export function buildHostAgentDraftRoute(serverId: string): string {
  const normalized = trimNonEmpty(serverId);
  if (!normalized) {
    return "/";
  }
  return `/h/${encodeSegment(normalized)}/agent`;
}

export function buildHostAgentDetailRoute(
  serverId: string,
  agentId: string
): string {
  const normalizedServerId = trimNonEmpty(serverId);
  const normalizedAgentId = trimNonEmpty(agentId);
  if (!normalizedServerId || !normalizedAgentId) {
    return "/";
  }
  return `/h/${encodeSegment(normalizedServerId)}/agent/${encodeSegment(
    normalizedAgentId
  )}`;
}

export function buildHostAgentsRoute(serverId: string): string {
  const normalized = trimNonEmpty(serverId);
  if (!normalized) {
    return "/";
  }
  return `/h/${encodeSegment(normalized)}/agents`;
}

export function buildHostSettingsRoute(serverId: string): string {
  const normalized = trimNonEmpty(serverId);
  if (!normalized) {
    return "/";
  }
  return `/h/${encodeSegment(normalized)}/settings`;
}

export function mapPathnameToServer(
  pathname: string,
  nextServerId: string
): string {
  const normalized = trimNonEmpty(nextServerId);
  if (!normalized) {
    return "/";
  }

  const suffix = pathname.replace(/^\/h\/[^/]+\/?/, "");
  const base = `/h/${encodeSegment(normalized)}`;
  if (suffix.startsWith("settings")) {
    return `${base}/settings`;
  }
  if (suffix.startsWith("agents")) {
    return `${base}/agents`;
  }
  return `${base}/agent`;
}

