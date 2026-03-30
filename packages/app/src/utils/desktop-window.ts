import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, type PointerEvent as RNPointerEvent, type ViewProps } from "react-native";
import {
  getIsDesktopMac,
  getIsDesktop,
  DESKTOP_TRAFFIC_LIGHT_WIDTH,
  DESKTOP_TRAFFIC_LIGHT_HEIGHT,
  DESKTOP_WINDOW_CONTROLS_WIDTH,
  DESKTOP_WINDOW_CONTROLS_HEIGHT,
} from "@/constants/layout";
import { getDesktopWindow } from "@/desktop/electron/window";
import { isDesktop } from "@/desktop/host";
import { usePanelStore } from "@/stores/panel-store";
import { readFiniteScreenPoint } from "./desktop-window-drag-coordinates";

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

// ---------------------------------------------------------------------------
// Manual window dragging via pointer events.
// Mirrors the Tauri implementation: single pointerdown handler with
// double-click-to-maximize via timing, closest() for interactive check,
// and pointer capture for move tracking.
// ---------------------------------------------------------------------------

const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, " +
  "[role='button'], [role='link'], [role='textbox'], [role='combobox'], " +
  "[role='tab'], [role='switch'], [role='checkbox'], [role='slider'], " +
  "[role='menuitem'], [tabindex], [contenteditable='true']";

const DOUBLE_CLICK_MS = 300;

type DesktopDragViewProps = Pick<
  ViewProps,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
>;

export function isInteractiveDesktopDragTarget(target: unknown): boolean {
  const candidate = target as unknown as { closest?: (selector: string) => Element | null } | null;
  if (!candidate || typeof candidate.closest !== "function") {
    return false;
  }

  return Boolean(candidate.closest(INTERACTIVE_SELECTOR));
}

export function useDesktopDragHandlers(): DesktopDragViewProps {
  const isDragging = useRef(false);
  const lastPointerDownAt = useRef(0);
  const isActive = Platform.OS === "web" && isDesktop();

  useEffect(() => {
    if (!isActive) return;
    function handleBlur() {
      if (!isDragging.current) return;
      isDragging.current = false;
      getDesktopWindow()?.endMove?.();
    }
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [isActive]);

  return useMemo((): DesktopDragViewProps => {
    if (!isActive) return {};

    function stopDrag(e: RNPointerEvent) {
      if (!isDragging.current) return;
      isDragging.current = false;
      // On web, currentTarget is a DOM Element (typed as HostInstance in RN)
      const el = e.currentTarget as unknown as Element | null;
      if (el && "releasePointerCapture" in el) {
        el.releasePointerCapture(e.nativeEvent.pointerId);
      }
      getDesktopWindow()?.endMove?.();
    }

    return {
      onPointerDown: (e: RNPointerEvent) => {
        if (e.nativeEvent.button !== 0) return;

        if (isInteractiveDesktopDragTarget(e.target)) return;

        e.preventDefault();

        const now = Date.now();
        if (now - lastPointerDownAt.current < DOUBLE_CLICK_MS) {
          lastPointerDownAt.current = 0;
          void toggleMaximize();
          return;
        }
        lastPointerDownAt.current = now;

        const win = getDesktopWindow();
        if (!win?.startMove) return;
        const screenPoint = readFiniteScreenPoint(e.nativeEvent);
        if (!screenPoint) return;

        isDragging.current = true;
        const el = e.currentTarget as unknown as Element;
        el.setPointerCapture(e.nativeEvent.pointerId);
        win.startMove(screenPoint.screenX, screenPoint.screenY);
      },
      onPointerMove: (e: RNPointerEvent) => {
        if (!isDragging.current) return;
        const screenPoint = readFiniteScreenPoint(e.nativeEvent);
        if (!screenPoint) {
          stopDrag(e);
          return;
        }
        getDesktopWindow()?.moving?.(screenPoint.screenX, screenPoint.screenY);
      },
      onPointerUp: stopDrag,
      onPointerCancel: stopDrag,
    };
  }, [isActive]);
}

type RawWindowControlsPadding = {
  left: number;
  right: number;
  top: number;
};

type WindowControlsPaddingRole = "sidebar" | "header" | "tabRow" | "explorerSidebar";

function useRawWindowControlsPadding(): RawWindowControlsPadding {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || !getIsDesktop()) return;

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

      const fullscreen = typeof win.isFullscreen === "function" ? await win.isFullscreen() : false;
      if (disposed) return;
      setIsFullscreen(fullscreen);

      if (typeof win.onResized !== "function") {
        return;
      }

      const unlisten = await win.onResized(async () => {
        if (disposed) return;
        const fs = typeof win.isFullscreen === "function" ? await win.isFullscreen() : false;
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

  return useMemo((): RawWindowControlsPadding => {
    if (!getIsDesktop() || isFullscreen) {
      return { left: 0, right: 0, top: 0 };
    }

    if (getIsDesktopMac()) {
      return {
        left: DESKTOP_TRAFFIC_LIGHT_WIDTH,
        right: 0,
        top: DESKTOP_TRAFFIC_LIGHT_HEIGHT,
      };
    }

    return {
      left: 0,
      right: DESKTOP_WINDOW_CONTROLS_WIDTH,
      top: DESKTOP_WINDOW_CONTROLS_HEIGHT,
    };
  }, [isFullscreen]);
}

export function useWindowControlsPadding(
  role: WindowControlsPaddingRole,
): { left: number; right: number; top: number } {
  const sidebarOpen = usePanelStore((state) => state.desktop.agentListOpen);
  const explorerOpen = usePanelStore((state) => state.desktop.fileExplorerOpen);
  const focusModeEnabled = usePanelStore((state) => state.desktop.focusModeEnabled);
  const rawPadding = useRawWindowControlsPadding();
  const sidebarClosed = !sidebarOpen;

  let left = 0;
  let right = 0;
  let top = 0;

  if (role === "sidebar") {
    left = rawPadding.left;
    top = rawPadding.top;
  } else if (role === "header") {
    left = sidebarClosed ? rawPadding.left : 0;
    right = explorerOpen ? 0 : rawPadding.right;
  } else if (role === "tabRow") {
    left = sidebarClosed && focusModeEnabled ? rawPadding.left : 0;
    right = focusModeEnabled && !explorerOpen ? rawPadding.right : 0;
  } else if (role === "explorerSidebar") {
    right = rawPadding.right;
  }

  return useMemo(() => ({ left, right, top }), [left, right, top]);
}
