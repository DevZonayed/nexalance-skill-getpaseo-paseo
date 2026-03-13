export interface InlinePathTarget {
  raw: string;
  path: string;
  lineStart?: number;
  lineEnd?: number;
}

const FILE_PROTOCOL = "file:";

function normalizePathToken(value: string): string | null {
  const trimmed = value
    .trim()
    .replace(/^['"`]/, "")
    .replace(/['"`]$/, "");

  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\\/g, "/");
}

/**
 * Strict VSCode-style markers only.
 *
 * Supported:
 * - `filename:linenumber`
 * - `filename:lineStart-lineEnd`
 *
 * Not supported (by design):
 * - plain `filename` (no line)
 * - `:linenumber` (range-only)
 */
export function parseInlinePathToken(value: string): InlinePathTarget | null {
  const rawValue = value ?? "";
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(.+?):([0-9]+)(?:-([0-9]+))?$/);
  if (!match) {
    return null;
  }

  const basePathRaw = match[1]?.trim();
  if (!basePathRaw) {
    return null;
  }

  // Avoid accidentally treating URLs as file paths.
  if (basePathRaw.includes("://")) {
    return null;
  }

  const normalizedPath = normalizePathToken(basePathRaw);
  if (!normalizedPath) {
    return null;
  }

  const lineStart = parseInt(match[2], 10);
  if (!Number.isFinite(lineStart) || lineStart <= 0) {
    return null;
  }

  const lineEnd = match[3] ? parseInt(match[3], 10) : undefined;
  if (lineEnd !== undefined) {
    if (!Number.isFinite(lineEnd) || lineEnd <= 0) {
      return null;
    }
    if (lineEnd < lineStart) {
      return null;
    }
  }

  return {
    raw: rawValue,
    path: normalizedPath,
    lineStart,
    lineEnd,
  };
}

export function parseFileProtocolUrl(value: string): InlinePathTarget | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== FILE_PROTOCOL) {
    return null;
  }

  const normalizedPath = normalizeFileUrlPath(parsedUrl.pathname);
  if (!normalizedPath) {
    return null;
  }

  const rawFragment = parsedUrl.hash.startsWith("#")
    ? parsedUrl.hash.slice(1)
    : parsedUrl.hash;
  const lineMatch = rawFragment.match(/^L([0-9]+)(?:-L?([0-9]+))?$/i);
  const lineStart = lineMatch?.[1] ? parseInt(lineMatch[1], 10) : undefined;
  const lineEnd = lineMatch?.[2] ? parseInt(lineMatch[2], 10) : undefined;

  if (
    (lineStart !== undefined && (!Number.isFinite(lineStart) || lineStart <= 0)) ||
    (lineEnd !== undefined && (!Number.isFinite(lineEnd) || lineEnd <= 0)) ||
    (lineStart !== undefined && lineEnd !== undefined && lineEnd < lineStart)
  ) {
    return null;
  }

  return {
    raw: value,
    path: normalizedPath,
    lineStart,
    lineEnd,
  };
}

function normalizeFileUrlPath(pathname: string): string | null {
  if (!pathname) {
    return null;
  }

  const decoded = decodeURIComponent(pathname).replace(/\\/g, "/");
  if (!decoded) {
    return null;
  }

  if (/^\/[A-Za-z]:\//.test(decoded)) {
    return decoded.slice(1);
  }

  return decoded;
}
