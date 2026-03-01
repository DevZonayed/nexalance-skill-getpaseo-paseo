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

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
  return trimNonEmpty(decodeSegment(raw));
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

  const serverId = trimNonEmpty(decodeSegment(encodedServerId));
  const agentId = trimNonEmpty(decodeSegment(encodedAgentId));
  if (!serverId || !agentId) {
    return null;
  }

  return { serverId, agentId };
}

export function parseHostAgentDraftRouteFromPathname(
  pathname: string
): { serverId: string } | null {
  const match = pathname.match(/^\/h\/([^/]+)\/(?:agent|new)\/?$/);
  if (!match) {
    return null;
  }
  const encodedServerId = match[1];
  if (!encodedServerId) {
    return null;
  }
  const serverId = trimNonEmpty(decodeSegment(encodedServerId));
  if (!serverId) {
    return null;
  }
  return { serverId };
}

export function buildHostAgentDraftRoute(serverId: string): string {
  return buildHostDraftRoute(serverId);
}

export function parseHostDraftRouteFromPathname(
  pathname: string
): { serverId: string } | null {
  const match = pathname.match(/^\/h\/([^/]+)\/new\/?$/);
  if (!match) {
    return null;
  }
  const encodedServerId = match[1];
  if (!encodedServerId) {
    return null;
  }
  const serverId = trimNonEmpty(decodeSegment(encodedServerId));
  if (!serverId) {
    return null;
  }
  return { serverId };
}

export function buildHostDraftRoute(serverId: string): string {
  const normalized = trimNonEmpty(serverId);
  if (!normalized) {
    return "/";
  }
  return `/h/${encodeSegment(normalized)}/new`;
}

export function parseHostWorkspaceRouteFromPathname(
  pathname: string
): { serverId: string; workspaceId: string } | null {
  const match = pathname.match(/^\/h\/([^/]+)\/workspace\/([^/]+)(?:\/|$)/);
  if (!match) {
    return null;
  }
  const [, encodedServerId, encodedWorkspaceId] = match;
  if (!encodedServerId || !encodedWorkspaceId) {
    return null;
  }
  const serverId = trimNonEmpty(decodeSegment(encodedServerId));
  const workspaceId = trimNonEmpty(decodeSegment(encodedWorkspaceId));
  if (!serverId || !workspaceId) {
    return null;
  }
  return { serverId, workspaceId };
}

export function parseHostWorkspaceAgentRouteFromPathname(
  pathname: string
): { serverId: string; workspaceId: string; agentId: string } | null {
  const match = pathname.match(
    /^\/h\/([^/]+)\/workspace\/([^/]+)\/agent\/([^/]+)(?:\/|$)/
  );
  if (!match) {
    return null;
  }
  const [, encodedServerId, encodedWorkspaceId, encodedAgentId] = match;
  if (!encodedServerId || !encodedWorkspaceId || !encodedAgentId) {
    return null;
  }
  const serverId = trimNonEmpty(decodeSegment(encodedServerId));
  const workspaceId = trimNonEmpty(decodeSegment(encodedWorkspaceId));
  const agentId = trimNonEmpty(decodeSegment(encodedAgentId));
  if (!serverId || !workspaceId || !agentId) {
    return null;
  }
  return { serverId, workspaceId, agentId };
}

export function parseHostWorkspaceTerminalRouteFromPathname(
  pathname: string
): { serverId: string; workspaceId: string; terminalId: string } | null {
  const match = pathname.match(
    /^\/h\/([^/]+)\/workspace\/([^/]+)\/terminal\/([^/]+)(?:\/|$)/
  );
  if (!match) {
    return null;
  }
  const [, encodedServerId, encodedWorkspaceId, encodedTerminalId] = match;
  if (!encodedServerId || !encodedWorkspaceId || !encodedTerminalId) {
    return null;
  }
  const serverId = trimNonEmpty(decodeSegment(encodedServerId));
  const workspaceId = trimNonEmpty(decodeSegment(encodedWorkspaceId));
  const terminalId = trimNonEmpty(decodeSegment(encodedTerminalId));
  if (!serverId || !workspaceId || !terminalId) {
    return null;
  }
  return { serverId, workspaceId, terminalId };
}

export function buildHostWorkspaceRoute(
  serverId: string,
  workspaceId: string
): string {
  const normalizedServerId = trimNonEmpty(serverId);
  const normalizedWorkspaceId = trimNonEmpty(workspaceId);
  if (!normalizedServerId || !normalizedWorkspaceId) {
    return "/";
  }
  return `/h/${encodeSegment(normalizedServerId)}/workspace/${encodeSegment(
    normalizedWorkspaceId
  )}`;
}

export function buildHostWorkspaceAgentRoute(
  serverId: string,
  workspaceId: string,
  agentId: string
): string {
  const base = buildHostWorkspaceRoute(serverId, workspaceId);
  const normalizedAgentId = trimNonEmpty(agentId);
  if (base === "/" || !normalizedAgentId) {
    return "/";
  }
  return `${base}/agent/${encodeSegment(normalizedAgentId)}`;
}

export function buildHostWorkspaceTerminalRoute(
  serverId: string,
  workspaceId: string,
  terminalId: string
): string {
  const base = buildHostWorkspaceRoute(serverId, workspaceId);
  const normalizedTerminalId = trimNonEmpty(terminalId);
  if (base === "/" || !normalizedTerminalId) {
    return "/";
  }
  return `${base}/terminal/${encodeSegment(normalizedTerminalId)}`;
}

export function buildHostAgentDetailRoute(
  serverId: string,
  agentId: string,
  workspaceId?: string
): string {
  const normalizedWorkspaceId = trimNonEmpty(workspaceId);
  if (normalizedWorkspaceId) {
    return buildHostWorkspaceAgentRoute(
      serverId,
      normalizedWorkspaceId,
      agentId
    );
  }
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
  if (suffix.startsWith("new")) {
    return `${base}/new`;
  }
  if (suffix.startsWith("workspace/")) {
    return `${base}/${suffix}`;
  }
  if (suffix.startsWith("agent/")) {
    return `${base}/${suffix}`;
  }
  return base;
}
