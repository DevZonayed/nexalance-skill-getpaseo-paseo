import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

export type SherpaOnnxModule = {
  createOnlineRecognizer: (config: any) => any;
  createOfflineRecognizer: (config: any) => any;
  createOfflineTts: (config: any) => any;
};

let cached: SherpaOnnxModule | null = null;

function ensureSherpaNativeLibraryPath(requireFn: NodeRequire): void {
  const platform = os.platform();
  if (platform !== "darwin" && platform !== "linux") {
    return;
  }

  const platformArch = `${platform}-${os.arch()}`;
  const packageName = `sherpa-onnx-${platformArch}`;

  let nativeDir: string;
  try {
    const binaryPath = requireFn.resolve(`${packageName}/sherpa-onnx.node`);
    nativeDir = path.dirname(binaryPath);
  } catch {
    return;
  }

  const envKey = platform === "darwin" ? "DYLD_LIBRARY_PATH" : "LD_LIBRARY_PATH";
  const current = process.env[envKey]?.trim() ?? "";
  const entries = current.length > 0 ? current.split(":").filter(Boolean) : [];
  if (entries.includes(nativeDir)) {
    return;
  }

  process.env[envKey] = entries.length > 0 ? `${nativeDir}:${entries.join(":")}` : nativeDir;
}

export function loadSherpaOnnx(): SherpaOnnxModule {
  if (cached) {
    return cached;
  }
  const require = createRequire(import.meta.url);
  ensureSherpaNativeLibraryPath(require);
  cached = require("sherpa-onnx") as SherpaOnnxModule;
  return cached;
}
