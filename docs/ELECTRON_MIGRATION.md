# Electron Migration

## Why switch

Paseo Desktop is a webview that loads an Expo web build plus a Node daemon that manages AI coding agents. Tauri is designed for apps that need a thin native wrapper — it assumes your backend logic lives in Rust. Paseo's backend is entirely Node/TypeScript. The result is that we're reimplementing Electron's built-in Node bundling inside Tauri's resource system.

### Pain points with Tauri today

**Managed runtime bundling is the #1 source of complexity.** `build-managed-runtime.mjs` (590 lines) downloads a Node distribution, packs three workspace tarballs, installs them with the bundled npm, separately installs sherpa-onnx platform packages, prunes ONNX/node-pty/ripgrep binaries per platform, and writes a runtime manifest. This exists solely because Tauri doesn't ship Node.

**Linux is fragile.** We wrote a custom AppImage Wayland patch (`maybePatchLinuxAddonRunpath` in sherpa-onnx-node-loader, plus AppImage patching scripts) because Tauri's Linux webview has Wayland issues. Electron handles Wayland/X11 transparently via Chromium's `--ozone-platform-hint=auto`.

**Native notification callbacks required Objective-C.** We wrote `paseo_notifications.m` (UNUserNotificationCenter delegate bridge) and compiled it into the Tauri build just to get notification click callbacks on macOS. Linux and Windows notification callbacks are unimplemented. Electron's `Notification` API provides click/reply/action callbacks cross-platform with zero native code.

**Windows is undertested.** The Rust code has `#[cfg(windows)]` blocks for named pipes, PowerShell `Expand-Archive`, `CREATE_NO_WINDOW` flags, NSIS installer hooks — all written speculatively with limited testing. Electron's cross-platform abstractions cover all of this.

**IPC is boilerplate-heavy.** Every desktop command requires a Rust `#[tauri::command]` function, a `spawn_blocking` wrapper, serde types, registration in `generate_handler![]`, and a TypeScript `invokeDesktopCommand()` call. There are 22 commands today. In Electron, the main process is Node — these become direct function calls or simple `ipcMain.handle()` handlers in the same language as the rest of the codebase.

**Tauri plugin gaps.** Features like tray menus with dynamic updates, global shortcuts, deep links, system idle detection, auto-launch on login, and rich clipboard access all require Rust plugins (often per-platform). Electron provides these as JS API calls.

### What we gain

- **Delete `build-managed-runtime.mjs`** — Node comes with Electron
- **Delete the Wayland/AppImage patching** — Chromium handles it
- **Delete `paseo_notifications.m`** — `Notification` API works cross-platform
- **Delete `runtime_manager.rs`** (1080 lines) — daemon becomes a `child_process.fork()` call
- **Delete all Rust code** — `lib.rs` (683 lines), `desktop_notifications.rs`, `build.rs`, Cargo.toml dependencies
- **Delete sherpa rpath patching** — `electron-rebuild` handles native addon ABI matching
- **One language** for the entire desktop app (TypeScript)
- **Windows support** works out of the box
- **Mature auto-update** via electron-updater (GitHub Releases, S3, etc.)
- **Mature code signing** for macOS and Windows without custom scripts

### What we lose

- **App size increases** from ~20 MB to ~150-200 MB (ships Chromium)
- **Memory footprint increases** (Chromium process model)
- **Tauri's Rust escape hatch** — though we only use Rust because Tauri requires it, not because we need it

### ONNX / Sherpa native addons

`sherpa-onnx-node` and `onnxruntime-node` ship prebuilt `.node` addons per platform. In Electron, `@electron/rebuild` rebuilds or verifies native addons against Electron's Node ABI. This is standard practice — packages like `better-sqlite3`, `sharp`, and `node-pty` all work this way. The manual sherpa platform package installation and rpath patching goes away entirely.

## What can be collapsed

### Build infrastructure (delete entirely)

| File | Lines | Purpose |
|---|---|---|
| `packages/desktop/scripts/build-managed-runtime.mjs` | 590 | Bundle Node + workspaces into Tauri sidecar |
| `packages/desktop/scripts/validate-managed-runtime.mjs` | ~100 | Validate bundled runtime integrity |
| `packages/desktop/scripts/sign-managed-runtime-macos.mjs` | ~100 | Code-sign macOS sidecar bundles |
| `packages/desktop/scripts/managed-daemon-smoke.mjs` | ~50 | Smoke test for managed daemon |

Electron replacement: None. Node is part of Electron. Workspace code loads directly via `require`/`import`.

### Rust backend (delete entirely)

| File | Lines | Purpose |
|---|---|---|
| `src-tauri/src/lib.rs` | 683 | App setup, IPC commands, menu, zoom |
| `src-tauri/src/runtime_manager.rs` | 1080 | Managed runtime/daemon lifecycle |
| `src-tauri/src/desktop_notifications.rs` | ~80 | Notification bridge |
| `src-tauri/src/main.rs` | ~10 | Entry point |
| `src-tauri/build.rs` | ~30 | Build script (compiles ObjC) |
| `src-tauri/Cargo.toml` | ~30 | Rust dependencies |
| `src-tauri/tauri.conf.json` | ~100 | Tauri configuration |

Electron replacement: A single `main.ts` (~200-300 lines) covering window creation, menu, IPC handlers, and daemon lifecycle.

### Native platform code (delete entirely)

| File | Purpose |
|---|---|
| `src-tauri/macos/paseo_notifications.h` | ObjC notification bridge header |
| `src-tauri/macos/paseo_notifications.m` | ObjC UNUserNotificationCenter delegate |
| `src-tauri/Info.plist` | macOS bundle config |
| `src-tauri/Entitlements.plist` | macOS entitlements |
| `src-tauri/installer-hooks.nsh` | Windows NSIS post-install hooks |

Electron replacement: `Notification` API (2-3 lines per notification). macOS entitlements handled by `electron-builder` config.

### Daemon management (massive simplification)

**Tauri today:** Bundled Node binary → spawn as child process → pipe stdout/stderr → poll `daemon status --json` in a loop → parse JSON → return via Tauri IPC.

**Electron:** `child_process.fork('./packages/server/dist/scripts/daemon-runner.js')` — same Node runtime, same ABI, direct IPC via Node's built-in channel.

### Local daemon transport (simplification)

**Tauri today:** `runtime_manager.rs` implements a full WebSocket client in Rust (tokio-tungstenite) with session management, base64 binary encoding over Tauri events, and manual read/write task spawning. ~300 lines of Rust.

**Electron:** The renderer can connect to Unix sockets / named pipes directly via the main process using Node's `ws` package (already a dependency). Or use `ipcMain` to proxy — still TypeScript, still ~50 lines.

### Attachment file management (simplification)

**Tauri today:** 6 Rust commands (`write_attachment_base64`, `copy_attachment_file`, `read_file_base64`, `delete_attachment_file`, `garbage_collect_attachment_files`) with path validation, base64 encoding/decoding, and directory traversal protection. ~200 lines of Rust.

**Electron:** Same logic in TypeScript using `fs` and `app.getPath('userData')`. ~50 lines.

### Window management (simplification)

**Tauri today:** Custom `tauri-window.ts` with `plugin:window|start_dragging`, `plugin:window|toggle_maximize`, `plugin:window|is_fullscreen` invocations.

**Electron:** `BrowserWindow` API — `win.maximize()`, `win.isFullScreen()`, etc. Frameless window dragging via CSS `-webkit-app-region: drag`.

### App updates (simplification)

**Tauri today:** Rust `check_app_update` / `install_app_update` commands using `tauri_plugin_updater`. Custom update check UI in the renderer.

**Electron:** `electron-updater` with `autoUpdater.checkForUpdatesAndNotify()`. Built-in download progress, restart handling, differential updates.

## Migration plan

### Guiding principle

Electron is mature. We are not doing anything new. Every feature we need has official documentation and established patterns. Never use workarounds — if something doesn't work, find the official way.

### Phase 1: Scaffold in parallel

Create `packages/desktop-electron` alongside `packages/desktop` (Tauri). Both coexist.

- Initialize with `electron-forge` or `electron-builder`
- Configure `BrowserWindow` to load the Expo web build (same as Tauri's webview)
- Set up `electron-builder` for macOS, Linux, Windows packaging
- Get a window rendering the Expo web app with no desktop features

### Phase 2: Introduce `isElectron` branching

Add platform detection infrastructure in `packages/app`:

- Add `isElectron()` / `isElectronMac()` alongside existing `isTauri()` / `isTauriMac()`
- Introduce a `isDesktop()` helper that returns `isTauri() || isElectron()`
- Create `packages/app/src/desktop/electron/invoke-desktop-command.ts` — Electron's equivalent of the Tauri invoke bridge, using `ipcRenderer.invoke()`
- Update `invokeDesktopCommand()` to route to the correct backend based on platform

### Phase 3: Port features incrementally

Work through each Tauri feature, adding the Electron variant. Never break Tauri while doing this.

**Tier 1 — Core (must work for the app to be usable):**

1. **Daemon lifecycle** — `child_process.fork()` the daemon runner from the main process. Expose `start/stop/restart/status` via `ipcMain.handle()`.
2. **Local daemon transport** — WebSocket client in the main process using `ws`, proxied to renderer via IPC.
3. **Window management** — Frameless window with overlay title bar, drag regions, zoom controls, fullscreen.
4. **Menu** — `Menu.buildFromTemplate()` with zoom controls and macOS app menu.

**Tier 2 — Desktop features:**

5. **Notifications** — `new Notification()` with click handlers.
6. **App updates** — `electron-updater` with GitHub Releases.
7. **File dialogs** — `dialog.showOpenDialog()` for directory picker.
8. **Confirm dialogs** — `dialog.showMessageBox()`.
9. **Open external URLs** — `shell.openExternal()`.
10. **Attachment file management** — `fs` operations in main process via IPC.

**Tier 3 — Polish:**

11. **CLI symlink instructions** — Generate platform-specific instructions in Node.
12. **Logging** — `electron-log` or simple file-based logging.
13. **Single instance** — `app.requestSingleInstanceLock()`.
14. **Console forwarding** — No bridge needed, main process is already Node.
15. **NSIS installer hooks** — `electron-builder` NSIS config for CLI symlink.

### Phase 4: Feature parity validation

- Test all features on macOS, Linux (X11 + Wayland), Windows
- Verify sherpa-onnx-node loads correctly via `@electron/rebuild`
- Verify daemon start/stop/restart lifecycle
- Verify auto-update flow
- Verify notification callbacks on all platforms
- Smoke test CLI passthrough mode

### Phase 5: Cut over

- Update CI to build Electron packages instead of Tauri
- Remove `packages/desktop` (Tauri)
- Remove all `isTauri()` branching, keep only `isElectron()` (rename to `isDesktop()`)
- Delete `src-tauri/` and all Rust code
- Delete `build-managed-runtime.mjs` and related scripts
- Delete sherpa rpath patching code

## Estimated code impact

| Category | Lines removed | Lines added |
|---|---|---|
| Rust backend | ~1,900 | 0 |
| ObjC native code | ~150 | 0 |
| Build scripts | ~850 | 0 |
| Tauri TypeScript bridge | ~300 | ~150 (Electron IPC) |
| Electron main process | 0 | ~300 |
| **Net** | **~3,200 removed** | **~450 added** |
