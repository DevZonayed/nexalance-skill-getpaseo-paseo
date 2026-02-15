type TerminalDebugGlobal = {
  __PASEO_TERMINAL_DEBUG?: boolean;
};

type TerminalDebugLogInput = {
  scope: string;
  event: string;
  details?: Record<string, unknown>;
};

function resolveGlobalDebugFlag(): boolean | null {
  if (typeof globalThis === "undefined") {
    return null;
  }

  const value = (globalThis as TerminalDebugGlobal).__PASEO_TERMINAL_DEBUG;
  if (typeof value === "boolean") {
    return value;
  }
  return null;
}

export function isTerminalDebugEnabled(): boolean {
  const globalFlag = resolveGlobalDebugFlag();
  if (globalFlag !== null) {
    return globalFlag;
  }
  return process.env.NODE_ENV === "development";
}

export function terminalDebugLog(input: TerminalDebugLogInput): void {
  if (!isTerminalDebugEnabled()) {
    return;
  }

  const payload = input.details
    ? { ...input.details, ts: Date.now() }
    : { ts: Date.now() };
  console.log(`[terminal][${input.scope}] ${input.event}`, payload);
}

function escapeControlBytes(input: { text: string }): string {
  let output = "";
  for (const char of input.text) {
    const code = char.charCodeAt(0);
    if (code === 10) {
      output += "\\n";
      continue;
    }
    if (code === 13) {
      output += "\\r";
      continue;
    }
    if (code === 9) {
      output += "\\t";
      continue;
    }
    if (code < 32 || code === 127) {
      output += `\\x${code.toString(16).padStart(2, "0")}`;
      continue;
    }
    output += char;
  }
  return output;
}

export function summarizeTerminalText(input: {
  text: string;
  maxChars?: number;
}): string {
  const maxChars = input.maxChars ?? 80;
  const escaped = escapeControlBytes({ text: input.text });
  if (escaped.length <= maxChars) {
    return escaped;
  }
  return `${escaped.slice(0, maxChars)}…`;
}
