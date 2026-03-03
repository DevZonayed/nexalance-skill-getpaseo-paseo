import { Buffer } from "buffer";

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

function toBase64UrlNoPad(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function tryDecodeBase64UrlNoPadUtf8(input: string): string | null {
  const normalized = input.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    return null;
  }

  const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

  let decoded: string;
  try {
    decoded = Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }

  // Validate via round-trip to avoid false positives ("workspace-1" etc).
  if (toBase64UrlNoPad(decoded) !== normalized) {
    return null;
  }

  return decoded;
}

function normalizeWorkspaceId(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

export function encodeWorkspaceIdForPathSegment(workspaceId: string): string {
  const normalized = trimNonEmpty(workspaceId);
  if (!normalized) {
    return "";
  }
  return toBase64UrlNoPad(normalizeWorkspaceId(normalized));
}

export function decodeWorkspaceIdFromPathSegment(workspaceIdSegment: string): string | null {
  const normalizedSegment = trimNonEmpty(workspaceIdSegment);
  if (!normalizedSegment) {
    return null;
  }

  // Decode %2F etc first (legacy scheme), but keep the raw segment to decide if base64 applies.
  const decoded = trimNonEmpty(decodeSegment(normalizedSegment));
  if (!decoded) {
    return null;
  }

  // Legacy: if it already looks like a path after decoding, keep it.
  if (decoded.includes("/") || decoded.includes("\\")) {
    return normalizeWorkspaceId(decoded);
  }

  const base64Decoded = tryDecodeBase64UrlNoPadUtf8(decoded);
  if (base64Decoded) {
    return normalizeWorkspaceId(base64Decoded);
  }

  return normalizeWorkspaceId(decoded);
}

export function encodeFilePathForPathSegment(filePath: string): string {
  const normalized = trimNonEmpty(filePath);
  if (!normalized) {
    return "";
  }
  return toBase64UrlNoPad(normalized);
}

export function decodeFilePathFromPathSegment(filePathSegment: string): string | null {
  const normalizedSegment = trimNonEmpty(filePathSegment);
  if (!normalizedSegment) {
    return null;
  }
  const decoded = trimNonEmpty(decodeSegment(normalizedSegment));
  if (!decoded) {
    return null;
  }
  return tryDecodeBase64UrlNoPadUtf8(decoded);
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
  const prefix = "/h/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const serverIdStart = prefix.length;
  const serverIdEnd = pathname.indexOf("/", serverIdStart);
  if (serverIdEnd < 0) {
    return null;
  }
  const rawServerId = pathname.slice(serverIdStart, serverIdEnd);
  const serverId = trimNonEmpty(decodeSegment(rawServerId));
  if (!serverId) {
    return null;
  }

  const workspacePrefix = "/workspace/";
  if (!pathname.startsWith(workspacePrefix, serverIdEnd)) {
    return null;
  }

  const workspaceIdStart = serverIdEnd + workspacePrefix.length;
  let workspaceIdEnd = pathname.length;

  const agentIdx = pathname.lastIndexOf("/agent/");
  if (agentIdx >= 0 && agentIdx > workspaceIdStart) {
    workspaceIdEnd = Math.min(workspaceIdEnd, agentIdx);
  }
  const terminalIdx = pathname.lastIndexOf("/terminal/");
  if (terminalIdx >= 0 && terminalIdx > workspaceIdStart) {
    workspaceIdEnd = Math.min(workspaceIdEnd, terminalIdx);
  }
  const tabIdx = pathname.lastIndexOf("/tab/");
  if (tabIdx >= 0 && tabIdx > workspaceIdStart) {
    workspaceIdEnd = Math.min(workspaceIdEnd, tabIdx);
  }
  const fileIdx = pathname.lastIndexOf("/file/");
  if (fileIdx >= 0 && fileIdx > workspaceIdStart) {
    workspaceIdEnd = Math.min(workspaceIdEnd, fileIdx);
  }

  const rawWorkspaceId = pathname.slice(workspaceIdStart, workspaceIdEnd).replace(/\/+$/, "");
  const workspaceId = decodeWorkspaceIdFromPathSegment(rawWorkspaceId);
  if (!workspaceId) {
    return null;
  }
  return { serverId, workspaceId };
}

export function parseHostWorkspaceAgentRouteFromPathname(
  pathname: string
): { serverId: string; workspaceId: string; agentId: string } | null {
  const prefix = "/h/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const serverIdStart = prefix.length;
  const serverIdEnd = pathname.indexOf("/", serverIdStart);
  if (serverIdEnd < 0) {
    return null;
  }
  const rawServerId = pathname.slice(serverIdStart, serverIdEnd);
  const serverId = trimNonEmpty(decodeSegment(rawServerId));
  if (!serverId) {
    return null;
  }

  const workspacePrefix = "/workspace/";
  if (!pathname.startsWith(workspacePrefix, serverIdEnd)) {
    return null;
  }

  const workspaceIdStart = serverIdEnd + workspacePrefix.length;
  const agentMarker = "/agent/";
  const agentIdx = pathname.lastIndexOf(agentMarker);
  if (agentIdx < 0 || agentIdx <= workspaceIdStart) {
    return null;
  }

  const rawWorkspaceId = pathname.slice(workspaceIdStart, agentIdx).replace(/\/+$/, "");
  const workspaceId = decodeWorkspaceIdFromPathSegment(rawWorkspaceId);
  if (!workspaceId) {
    return null;
  }

  const agentIdStart = agentIdx + agentMarker.length;
  const agentIdEnd = pathname.indexOf("/", agentIdStart);
  const rawAgentId =
    agentIdEnd < 0 ? pathname.slice(agentIdStart) : pathname.slice(agentIdStart, agentIdEnd);
  const agentId = trimNonEmpty(decodeSegment(rawAgentId));
  if (!agentId) {
    return null;
  }

  return { serverId, workspaceId, agentId };
}

export function parseHostWorkspaceTerminalRouteFromPathname(
  pathname: string
): { serverId: string; workspaceId: string; terminalId: string } | null {
  const prefix = "/h/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const serverIdStart = prefix.length;
  const serverIdEnd = pathname.indexOf("/", serverIdStart);
  if (serverIdEnd < 0) {
    return null;
  }
  const rawServerId = pathname.slice(serverIdStart, serverIdEnd);
  const serverId = trimNonEmpty(decodeSegment(rawServerId));
  if (!serverId) {
    return null;
  }

  const workspacePrefix = "/workspace/";
  if (!pathname.startsWith(workspacePrefix, serverIdEnd)) {
    return null;
  }

  const workspaceIdStart = serverIdEnd + workspacePrefix.length;
  const terminalMarker = "/terminal/";
  const terminalIdx = pathname.lastIndexOf(terminalMarker);
  if (terminalIdx < 0 || terminalIdx <= workspaceIdStart) {
    return null;
  }

  const rawWorkspaceId = pathname.slice(workspaceIdStart, terminalIdx).replace(/\/+$/, "");
  const workspaceId = decodeWorkspaceIdFromPathSegment(rawWorkspaceId);
  if (!workspaceId) {
    return null;
  }

  const terminalIdStart = terminalIdx + terminalMarker.length;
  const terminalIdEnd = pathname.indexOf("/", terminalIdStart);
  const rawTerminalId =
    terminalIdEnd < 0
      ? pathname.slice(terminalIdStart)
      : pathname.slice(terminalIdStart, terminalIdEnd);
  const terminalId = trimNonEmpty(decodeSegment(rawTerminalId));
  if (!terminalId) {
    return null;
  }

  return { serverId, workspaceId, terminalId };
}

export function parseHostWorkspaceTabRouteFromPathname(
  pathname: string
): { serverId: string; workspaceId: string; tabId: string } | null {
  const prefix = "/h/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const serverIdStart = prefix.length;
  const serverIdEnd = pathname.indexOf("/", serverIdStart);
  if (serverIdEnd < 0) {
    return null;
  }
  const rawServerId = pathname.slice(serverIdStart, serverIdEnd);
  const serverId = trimNonEmpty(decodeSegment(rawServerId));
  if (!serverId) {
    return null;
  }

  const workspacePrefix = "/workspace/";
  if (!pathname.startsWith(workspacePrefix, serverIdEnd)) {
    return null;
  }

  const workspaceIdStart = serverIdEnd + workspacePrefix.length;
  const tabMarker = "/tab/";
  const tabIdx = pathname.lastIndexOf(tabMarker);
  if (tabIdx < 0 || tabIdx <= workspaceIdStart) {
    return null;
  }

  const rawWorkspaceId = pathname.slice(workspaceIdStart, tabIdx).replace(/\/+$/, "");
  const workspaceId = decodeWorkspaceIdFromPathSegment(rawWorkspaceId);
  if (!workspaceId) {
    return null;
  }

  const tabIdStart = tabIdx + tabMarker.length;
  const tabIdEnd = pathname.indexOf("/", tabIdStart);
  const rawTabId =
    tabIdEnd < 0 ? pathname.slice(tabIdStart) : pathname.slice(tabIdStart, tabIdEnd);
  const tabId = trimNonEmpty(decodeSegment(rawTabId));
  if (!tabId) {
    return null;
  }

  return { serverId, workspaceId, tabId };
}

export function parseHostWorkspaceFileRouteFromPathname(
  pathname: string
): { serverId: string; workspaceId: string; filePath: string } | null {
  const prefix = "/h/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const serverIdStart = prefix.length;
  const serverIdEnd = pathname.indexOf("/", serverIdStart);
  if (serverIdEnd < 0) {
    return null;
  }
  const rawServerId = pathname.slice(serverIdStart, serverIdEnd);
  const serverId = trimNonEmpty(decodeSegment(rawServerId));
  if (!serverId) {
    return null;
  }

  const workspacePrefix = "/workspace/";
  if (!pathname.startsWith(workspacePrefix, serverIdEnd)) {
    return null;
  }

  const workspaceIdStart = serverIdEnd + workspacePrefix.length;
  const fileMarker = "/file/";
  const fileIdx = pathname.lastIndexOf(fileMarker);
  if (fileIdx < 0 || fileIdx <= workspaceIdStart) {
    return null;
  }

  const rawWorkspaceId = pathname.slice(workspaceIdStart, fileIdx).replace(/\/+$/, "");
  const workspaceId = decodeWorkspaceIdFromPathSegment(rawWorkspaceId);
  if (!workspaceId) {
    return null;
  }

  const filePathStart = fileIdx + fileMarker.length;
  const filePathEnd = pathname.indexOf("/", filePathStart);
  const rawFilePath =
    filePathEnd < 0 ? pathname.slice(filePathStart) : pathname.slice(filePathStart, filePathEnd);
  const filePath = decodeFilePathFromPathSegment(rawFilePath);
  if (!filePath) {
    return null;
  }

  return { serverId, workspaceId, filePath };
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
  const encodedWorkspaceId = encodeWorkspaceIdForPathSegment(normalizedWorkspaceId);
  if (!encodedWorkspaceId) {
    return "/";
  }
  return `/h/${encodeSegment(normalizedServerId)}/workspace/${encodeSegment(encodedWorkspaceId)}`;
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

export function buildHostWorkspaceTabRoute(
  serverId: string,
  workspaceId: string,
  tabId: string
): string {
  const base = buildHostWorkspaceRoute(serverId, workspaceId);
  const normalizedTabId = trimNonEmpty(tabId);
  if (base === "/" || !normalizedTabId) {
    return "/";
  }
  return `${base}/tab/${encodeSegment(normalizedTabId)}`;
}

export function buildHostWorkspaceFileRoute(
  serverId: string,
  workspaceId: string,
  filePath: string
): string {
  const base = buildHostWorkspaceRoute(serverId, workspaceId);
  const encodedFilePath = encodeFilePathForPathSegment(filePath);
  if (base === "/" || !encodedFilePath) {
    return "/";
  }
  return `${base}/file/${encodeSegment(encodedFilePath)}`;
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
