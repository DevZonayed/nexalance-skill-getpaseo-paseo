import path from "node:path";
import { existsSync } from "node:fs";
import { app, BrowserWindow, nativeImage } from "electron";
import { registerDaemonManager } from "./daemon/daemon-manager.js";
import { parseCliPassthroughArgsFromArgv, runCliPassthroughCommand } from "./daemon/runtime-paths.js";
import { closeAllTransportSessions } from "./daemon/local-transport.js";
import { registerWindowManager, setupWindowResizeEvents, setupDragDropPrevention } from "./window/window-manager.js";
import { registerDialogHandlers } from "./features/dialogs.js";
import { registerNotificationHandlers, ensureNotificationCenterRegistration } from "./features/notifications.js";
import { registerOpenerHandlers } from "./features/opener.js";
import { setupApplicationMenu } from "./features/menu.js";

const DEV_SERVER_URL = process.env.EXPO_DEV_URL ?? "http://localhost:8081";
app.setName("Paseo");

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function getProductionEntryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app-dist", "index.html");
  }

  return path.resolve(__dirname, "../../app/dist/index.html");
}

function getWindowIconPath(): string | null {
  const candidates = app.isPackaged
    ? process.platform === "win32"
        ? [path.join(process.resourcesPath, "icon.ico"), path.join(process.resourcesPath, "icon.png")]
        : [path.join(process.resourcesPath, "icon.png")]
    : process.platform === "darwin"
      ? [path.resolve(__dirname, "../assets/icon.png")]
      : process.platform === "win32"
        ? [path.resolve(__dirname, "../assets/icon.ico"), path.resolve(__dirname, "../assets/icon.png")]
        : [path.resolve(__dirname, "../assets/icon.png")];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function applyAppIcon(): void {
  if (process.platform !== "darwin") {
    return;
  }

  const iconPath = path.resolve(__dirname, "../assets/icon.png");
  if (!existsSync(iconPath)) {
    return;
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    return;
  }

  app.dock?.setIcon(icon);
}

async function createMainWindow(): Promise<void> {
  const isMac = process.platform === "darwin";
  const iconPath = getWindowIconPath();

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    ...(iconPath ? { icon: iconPath } : {}),
    titleBarStyle: isMac ? "hidden" : "default",
    trafficLightPosition: isMac ? { x: 16, y: 20 } : undefined,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  setupWindowResizeEvents(mainWindow);
  setupDragDropPrevention(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (!app.isPackaged) {
    const { loadReactDevTools } = await import("./features/react-devtools.js");
    await loadReactDevTools();
    await mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await mainWindow.loadFile(getProductionEntryPath());
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

function setupSingleInstanceLock(): boolean {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return false;
  }

  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.show();
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  return true;
}

async function runCliPassthroughIfRequested(): Promise<boolean> {
  const cliArgs = parseCliPassthroughArgsFromArgv(process.argv);
  if (!cliArgs) {
    return false;
  }

  try {
    const exitCode = runCliPassthroughCommand(cliArgs);
    process.exit(exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }

  return true;
}

async function bootstrap(): Promise<void> {
  if (await runCliPassthroughIfRequested()) {
    return;
  }

  if (!setupSingleInstanceLock()) {
    return;
  }

  await app.whenReady();
  applyAppIcon();
  setupApplicationMenu();
  ensureNotificationCenterRegistration();
  registerDaemonManager();
  registerWindowManager();
  registerDialogHandlers();
  registerNotificationHandlers();
  registerOpenerHandlers();
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
}

void bootstrap().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

app.on("before-quit", () => {
  closeAllTransportSessions();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
