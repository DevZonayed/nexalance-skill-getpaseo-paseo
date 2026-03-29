import { getDesktopHost, type DesktopWindowBridge } from "@/desktop/host";

export function getDesktopWindow(): DesktopWindowBridge | null {
  const getter = getDesktopHost()?.window?.getCurrentWindow;
  if (typeof getter !== "function") {
    return null;
  }
  try {
    return getter() ?? null;
  } catch {
    return null;
  }
}

export async function toggleDesktopMaximize(): Promise<void> {
  const win = getDesktopWindow();
  if (!win || typeof win.toggleMaximize !== "function") {
    return;
  }
  await win.toggleMaximize();
}

export async function isDesktopFullscreen(): Promise<boolean> {
  const win = getDesktopWindow();
  if (!win || typeof win.isFullscreen !== "function") {
    return false;
  }
  return await win.isFullscreen();
}

export async function setDesktopTitleBarTheme(theme: "light" | "dark"): Promise<void> {
  const win = getDesktopWindow();
  if (!win || typeof win.setTitleBarTheme !== "function") {
    return;
  }

  await win.setTitleBarTheme(theme);
}
