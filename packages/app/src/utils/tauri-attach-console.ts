import { getTauri } from "@/utils/tauri";

let attached = false;

export function attachConsole(): void {
  if (attached || !getTauri()) {
    return;
  }
  attached = true;

  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;

  function formatArgs(args: unknown[]): string {
    return args
      .map((a) =>
        typeof a === "string" ? a : JSON.stringify(a, null, 0) ?? String(a)
      )
      .join(" ");
  }

  function forwardToRust(level: number, args: unknown[]): void {
    const invoke = getTauri()?.core?.invoke;
    if (typeof invoke !== "function") return;
    try {
      void invoke("webview_log", { level, message: formatArgs(args) });
    } catch {
      // silently ignore IPC errors
    }
  }

  console.log = (...args: unknown[]) => {
    originalLog.apply(console, args);
    forwardToRust(0, args); // debug
  };
  console.info = (...args: unknown[]) => {
    originalInfo.apply(console, args);
    forwardToRust(1, args); // info
  };
  console.warn = (...args: unknown[]) => {
    originalWarn.apply(console, args);
    forwardToRust(2, args); // warn
  };
  console.error = (...args: unknown[]) => {
    originalError.apply(console, args);
    forwardToRust(3, args); // error
  };
  console.debug = (...args: unknown[]) => {
    originalDebug.apply(console, args);
    forwardToRust(0, args); // debug
  };
}
