import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { getIsElectronRuntime } from "@/constants/layout";
import { getDesktopWindow, updateDesktopWindowControls } from "@/desktop/electron/window";

const DEFAULT_OVERLAY_HEIGHT = 29;
const MAX_EFFECTIVE_TITLEBAR_HEIGHT = 48;

/**
 * VS Code-style titlebar drag region for Electron on Windows/Linux.
 *
 * Architecture copied from VS Code at commit daa0a70:
 *   - titlebarPart.ts:463-464  → dedicated absolute drag overlay element
 *   - titlebarpart.css:57-64   → drag region styles
 *   - titlebarpart.css:249-260 → top-edge resizer with no-drag, hidden in fullscreen
 *   - electron-browser/titlebarPart.ts:205-206 → resizer appended to root container
 *
 * This component renders two elements:
 * 1. A full-size absolute drag overlay with -webkit-app-region: drag
 * 2. A 4px top-edge resizer with -webkit-app-region: no-drag (hidden in fullscreen)
 *
 * Both are positioned absolute within the parent container. Interactive children
 * of the parent sit above the drag overlay via normal stacking order.
 * The global no-drag reset in index.html remains only as a defensive backstop.
 */

function useIsFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || !getIsElectronRuntime()) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    async function setup() {
      const win = getDesktopWindow();
      if (!win) return;

      const fs = typeof win.isFullscreen === "function" ? await win.isFullscreen() : false;
      if (disposed) return;
      setIsFullscreen(fs);

      if (typeof win.onResized !== "function") return;

      const unlisten = await win.onResized(async () => {
        if (disposed) return;
        const fullscreen = typeof win.isFullscreen === "function" ? await win.isFullscreen() : false;
        if (disposed) return;
        setIsFullscreen(fullscreen);
      });

      cleanup = unlisten;
      if (disposed) cleanup?.();
    }

    void setup();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return isFullscreen;
}

/**
 * Renders the VS Code-style drag overlay and top-edge resizer.
 * Only renders on Electron Windows/Linux (non-mac). Returns null otherwise.
 *
 * Usage: Place as a child of any positioned container that should be draggable.
 * Interactive elements in the same container will sit above the drag overlay
 * via normal DOM stacking order (later siblings paint over earlier ones).
 * Place TitlebarDragRegion BEFORE interactive children in JSX.
 */
export function TitlebarDragRegion() {
  if (Platform.OS !== "web" || !getIsElectronRuntime()) {
    return null;
  }

  return <TitlebarDragRegionInner />;
}

/**
 * Explicit no-drag content layer above the drag overlay.
 * Matches VS Code's pattern of z-index: 2500 + -webkit-app-region: no-drag
 * on interactive containers within the titlebar (titlebarpart.css:141-143,
 * 231-233, 264-268, 288-298, 382-401).
 *
 * Wrap interactive children of any TitlebarDragRegion parent in this component
 * so the no-drag layering is structural, not dependent on the global CSS backstop.
 * On non-Electron or mac, renders children directly with no wrapper.
 */
interface TitlebarNoDragContentProps {
  children: ReactNode;
  /** Layout direction for the no-drag wrapper. Default: "row" for header-style surfaces. */
  direction?: "row" | "column";
}

export function TitlebarNoDragContent({ children, direction = "row" }: TitlebarNoDragContentProps) {
  if (Platform.OS !== "web" || !getIsElectronRuntime()) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        position: "relative",
        zIndex: 2500,
        // @ts-expect-error — WebkitAppRegion is not in CSSProperties
        WebkitAppRegion: "no-drag",
        display: "flex",
        flexDirection: direction,
        alignItems: "center",
        justifyContent: direction === "column" ? "center" : undefined,
        flex: 1,
        height: "100%",
        minWidth: 0,
      }}
    >
      {children}
    </div>
  );
}

function TitlebarDragRegionInner() {
  const isFullscreen = useIsFullscreen();
  const dragRegionRef = useRef<HTMLDivElement | null>(null);
  const lastReportedHeightRef = useRef<number | null>(null);

  useEffect(() => {
    const dragRegion = dragRegionRef.current;
    const parent = dragRegion?.parentElement;
    if (!dragRegion || !parent) {
      return;
    }

    let disposed = false;
    let frameId: number | null = null;

    const reportHeight = () => {
      if (disposed) {
        return;
      }

      const nextHeight = Math.min(
        MAX_EFFECTIVE_TITLEBAR_HEIGHT,
        Math.max(DEFAULT_OVERLAY_HEIGHT, Math.round(parent.getBoundingClientRect().height)),
      );

      if (lastReportedHeightRef.current === nextHeight) {
        return;
      }

      lastReportedHeightRef.current = nextHeight;
      void updateDesktopWindowControls({ height: nextHeight }).catch((error) => {
        console.warn("[DesktopWindow] Failed to update window controls height", error);
      });
    };

    const scheduleReport = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        frameId = null;
        reportHeight();
      });
    };

    scheduleReport();

    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            scheduleReport();
          })
        : null;

    resizeObserver?.observe(parent);
    window.addEventListener("resize", scheduleReport);

    return () => {
      disposed = true;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleReport);
    };
  }, []);

  return (
    <>
      {/* Drag overlay — equivalent to VS Code .titlebar-drag-region */}
      <div
        ref={dragRegionRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          // @ts-expect-error — WebkitAppRegion is not in CSSProperties
          WebkitAppRegion: "drag",
          zIndex: 0,
          pointerEvents: "auto",
        }}
      />
      {/* Top-edge resizer — equivalent to VS Code .resizer */}
      {!isFullscreen && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 4,
            // @ts-expect-error — WebkitAppRegion is not in CSSProperties
            WebkitAppRegion: "no-drag",
            zIndex: 1,
          }}
        />
      )}
    </>
  );
}
