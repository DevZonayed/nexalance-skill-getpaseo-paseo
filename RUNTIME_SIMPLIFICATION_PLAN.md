# Runtime Simplification Plan

## Goal

Remove the managed runtime install/copy layer. The desktop app must run the bundled runtime in place from the application resources/install directory on macOS, Windows, and Linux.

This is a simplification task. If a change preserves the old install-manager shape under a new name, it fails the goal.

## Hard Requirements

1. The bundled runtime is read-only.
   The desktop app must not copy the bundled runtime to app data, temp, cache, or any other writable directory.

2. The app must execute Node/CLI/server entrypoints directly from the bundled runtime root.
   On macOS this means inside `Paseo.app/Contents/Resources/...`.
   On Windows and Linux this means inside the installed app resources directory.

3. There is exactly one runtime per installed app.
   Remove versioned installed runtime directories like `runtime/<runtime-id>` from the runtime execution path.

4. The CLI shim may point into the installed app bundle/directory.
   Do not keep an extra installed runtime tree just to preserve a stable shim target across updates.

5. All mutable state remains outside the bundled runtime.
   Logs, sockets/pipes, PID files, daemon state, `PASEO_HOME`, and any other writable files must continue to live in managed home / app data locations.

6. Runtime discovery must stay cross-platform.
   The implementation must resolve the bundled runtime/resources path on macOS, Windows, and Linux using the app install/resources directory, not hardcoded `.app` assumptions.

7. Remove dead machinery, do not leave adapters behind.
   If install/copy/versioned-runtime code becomes unused, delete it instead of keeping fallback paths "just in case".

## Non-Goals

1. Do not change how the runtime is built into the desktop app bundle in this task.
   This task is about runtime execution and path management, not bundling format.

2. Do not reintroduce a second runtime location for migration compatibility.
   It is acceptable if older installed clients do not migrate cleanly.

3. Do not add feature flags, env-guarded fallback paths, or compatibility shims unless absolutely required by a real platform constraint proven in code.

## Concrete Implementation Direction

1. Treat `bundled_runtime_root(app)` plus `current-runtime.json` as the runtime source of truth.

2. Replace `paths.runtime_root` usage for runtime execution with the bundled runtime root selected by `current-runtime.json`.

3. Delete `install_runtime_if_needed(...)` and related copy/install staging logic if nothing else still needs it.

4. Rework CLI shim generation so the inner launcher points at the bundled runtime's Node + CLI entrypoint directly, while still keeping mutable state (`PASEO_HOME`) outside the runtime.

5. Simplify `ManagedPaths` and related structs if `runtime_root` and `stable_runtime_root` no longer need separate installed-runtime semantics.

6. Keep diagnostics/status reporting accurate.
   If the app reports bundled vs installed runtime roots today, update that output to reflect the new single-runtime model.

## Acceptance Criteria

1. No code path copies the bundled runtime tree into app data before launching the daemon or CLI.

2. No code path depends on a versioned installed runtime directory for execution.

3. The CLI shim and daemon launch path both resolve to bundled runtime executables/resources.

4. Typecheck passes.

5. Relevant desktop/runtime tests pass, updated to reflect the new direct-from-bundle model.

6. The resulting implementation is materially simpler:
   fewer runtime path concepts, fewer staging/install branches, fewer indirections.

## Review Bar

The implementation should be rejected if:

- it still copies the runtime anywhere before execution
- it keeps runtime version directories in the execution path
- it preserves the stable installed runtime launcher concept without a hard platform reason
- it adds migration complexity for old installs
- it introduces new fallback branches instead of removing obsolete ones
