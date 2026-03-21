import { app, BrowserWindow, ipcMain } from "electron";
import {
  createWindowMoveState,
  readWindowMovePayload,
  resolveWindowMovePosition,
  type WindowMoveState,
} from "./window-drag-coordinates.js";

export function registerWindowManager(): void {
  // ---------------------------------------------------------------------------
  // Manual window dragging (replaces flaky CSS -webkit-app-region: drag).
  // State is keyed per window id to support multiple windows.
  // ---------------------------------------------------------------------------
  const moveStates = new Map<number, WindowMoveState>();

  ipcMain.on("paseo:window:startMove", (event, payload: { screenX: number; screenY: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const movePayload = readWindowMovePayload(payload);
    if (!movePayload) {
      moveStates.delete(win.id);
      return;
    }
    const [winX, winY] = win.getPosition();
    const moveState = createWindowMoveState({
      payload: movePayload,
      windowX: winX,
      windowY: winY,
    });
    if (!moveState) {
      moveStates.delete(win.id);
      return;
    }
    moveStates.set(win.id, moveState);
  });

  ipcMain.on("paseo:window:moving", (event, payload: { screenX: number; screenY: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const state = moveStates.get(win.id);
    if (!state) return;
    const movePayload = readWindowMovePayload(payload);
    if (!movePayload) {
      moveStates.delete(win.id);
      return;
    }
    const nextPosition = resolveWindowMovePosition({
      payload: movePayload,
      state,
    });
    if (!nextPosition) {
      moveStates.delete(win.id);
      return;
    }
    win.setPosition(nextPosition.x, nextPosition.y);
  });

  ipcMain.on("paseo:window:endMove", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) moveStates.delete(win.id);
  });

  app.on("browser-window-created", (_event, win) => {
    win.on("closed", () => moveStates.delete(win.id));
  });

  ipcMain.handle("paseo:window:toggleMaximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle("paseo:window:isFullscreen", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isFullScreen() ?? false;
  });

  ipcMain.handle("paseo:window:setBadgeCount", (_event, count?: number) => {
    if (process.platform === "darwin" || process.platform === "linux") {
      app.setBadgeCount(count ?? 0);
    }
  });
}

export function setupWindowResizeEvents(win: BrowserWindow): void {
  win.on("resize", () => {
    win.webContents.send("paseo:window:resized", {});
  });

  win.on("enter-full-screen", () => {
    win.webContents.send("paseo:window:resized", {});
  });

  win.on("leave-full-screen", () => {
    win.webContents.send("paseo:window:resized", {});
  });
}

/**
 * Prevent Electron from navigating to files dragged onto the window.
 * The renderer handles drag-drop via standard HTML5 APIs instead.
 */
export function setupDragDropPrevention(win: BrowserWindow): void {
  win.webContents.on("will-navigate", (event, url) => {
    // Allow normal navigation (e.g. dev server hot-reload) but block file:// URLs
    // that result from dropping files onto the window.
    if (url.startsWith("file://")) {
      event.preventDefault();
    }
  });
}
