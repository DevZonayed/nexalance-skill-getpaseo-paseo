import type { CSSProperties } from "react";
import { useState, useEffect } from "react";
import { Platform, type ViewStyle } from "react-native";
import {
  getIsDesktopMac,
  DESKTOP_TRAFFIC_LIGHT_WIDTH,
  DESKTOP_TRAFFIC_LIGHT_HEIGHT,
} from "@/constants/layout";
import { getDesktopWindow } from "@/desktop/electron/window";
import { isDesktop } from "@/desktop/host";

type DesktopDragHandlers = {
  style?: CSSProperties & ViewStyle;
};

const DESKTOP_DRAG_REGION_STYLE = {
  WebkitAppRegion: "drag",
} as CSSProperties & ViewStyle;

export async function startDragging() {
  const win = getDesktopWindow();
  if (win && typeof win.startDragging === "function") {
    try {
      await win.startDragging();
    } catch (error) {
      console.warn("[DesktopWindow] startDragging failed", error);
    }
  }
}

export async function toggleMaximize() {
  const win = getDesktopWindow();
  if (win && typeof win.toggleMaximize === "function") {
    try {
      await win.toggleMaximize();
    } catch (error) {
      console.warn("[DesktopWindow] toggleMaximize failed", error);
    }
  }
}

export function useDesktopDragHandlers(): DesktopDragHandlers {
  if (Platform.OS !== "web" || !isDesktop()) {
    return {};
  }

  return {
    style: DESKTOP_DRAG_REGION_STYLE,
  };
}

export function useTrafficLightPadding(): { left: number; top: number } {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || !getIsDesktopMac()) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;
    let didCleanup = false;

    function runCleanup() {
      if (!cleanup || didCleanup) return;
      didCleanup = true;
      try {
        void Promise.resolve(cleanup()).catch((error) => {
          console.warn("[DesktopWindow] Failed to remove resize listener", error);
        });
      } catch (error) {
        console.warn("[DesktopWindow] Failed to remove resize listener", error);
      }
    }

    async function setup() {
      const win = getDesktopWindow();
      if (!win) return;

      const fullscreen =
        typeof win.isFullscreen === "function" ? await win.isFullscreen() : false;
      if (disposed) return;
      setIsFullscreen(fullscreen);

      if (typeof win.onResized !== "function") {
        return;
      }

      const unlisten = await win.onResized(async () => {
        if (disposed) return;
        const fs =
          typeof win.isFullscreen === "function" ? await win.isFullscreen() : false;
        if (disposed) return;
        setIsFullscreen(fs);
      });

      cleanup = unlisten;
      if (disposed) {
        runCleanup();
      }
    }

    void setup();

    return () => {
      disposed = true;
      runCleanup();
    };
  }, []);

  if (!getIsDesktopMac() || isFullscreen) {
    return { left: 0, top: 0 };
  }

  return {
    left: DESKTOP_TRAFFIC_LIGHT_WIDTH,
    top: DESKTOP_TRAFFIC_LIGHT_HEIGHT,
  };
}
