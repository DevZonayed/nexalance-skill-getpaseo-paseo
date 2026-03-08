# Managed CLI Global Install

## Status

Implemented on this branch.

The original plan was to replace the desktop app's state-file trampoline CLI install flow with a stable outer shim, a bundle-managed inner launcher, structured install results, UI fallback instructions, and Docker-like CLI default host resolution. That work now exists in code and this file records what shipped.

## What Exists

### Desktop runtime and launcher

- The desktop runtime bundle is assembled by [build-managed-runtime.mjs](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/desktop/scripts/build-managed-runtime.mjs).
- The Tauri runtime manager now maintains:
  - a stable inner launcher under `bin/`
  - a trivial outer PATH shim
  - structured CLI install/uninstall results
  - manual install instructions
- The old `--paseo-cli-shim <state-file>` trampoline is no longer the installed shim path.

Relevant files:

- [runtime_manager.rs](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/desktop/src-tauri/src/runtime_manager.rs)
- [lib.rs](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/desktop/src-tauri/src/lib.rs)
- [build-managed-runtime.mjs](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/desktop/scripts/build-managed-runtime.mjs)
- [managed-daemon-smoke.mjs](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/desktop/scripts/managed-daemon-smoke.mjs)

### App UI and desktop bridge

- The desktop bridge exposes a structured `CliShimResult` with explicit statuses and optional manual instructions.
- The desktop settings UI now:
  - warns that a permissions prompt may appear before install starts
  - opens a dedicated modal when manual install is required
  - shows copyable platform-specific commands

Relevant files:

- [managed-runtime.ts](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/app/src/desktop/managed-runtime/managed-runtime.ts)
- [desktop-updates-section.tsx](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/app/src/desktop/components/desktop-updates-section.tsx)

### CLI default host resolution

- The CLI now resolves default daemon targets in this order when `--host` is not provided:
  1. local IPC target if discoverable
  2. configured non-default TCP target
  3. `localhost:6767`

Relevant files:

- [client.ts](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/cli/src/utils/client.ts)
- [28-client-ipc-targets.test.ts](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/cli/tests/28-client-ipc-targets.test.ts)

## Files Created For This Work

- [MANAGED_CLI_GLOBAL_INSTALL_LOOP_PLAN.md](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/MANAGED_CLI_GLOBAL_INSTALL_LOOP_PLAN.md)
- [managed-runtime.test.ts](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/app/src/desktop/managed-runtime/managed-runtime.test.ts)
- [managed-runtime.ts](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/app/src/desktop/managed-runtime/managed-runtime.ts)
- [managed-tauri-daemon-transport.test.ts](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/app/src/utils/managed-tauri-daemon-transport.test.ts)
- [managed-tauri-daemon-transport.ts](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/app/src/utils/managed-tauri-daemon-transport.ts)
- [28-client-ipc-targets.test.ts](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/cli/tests/28-client-ipc-targets.test.ts)
- [build-managed-runtime.mjs](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/desktop/scripts/build-managed-runtime.mjs)
- [managed-daemon-smoke.mjs](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/desktop/scripts/managed-daemon-smoke.mjs)
- [runtime_manager.rs](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/desktop/src-tauri/src/runtime_manager.rs)
- [resources/.gitkeep](/Users/moboudra/.paseo/worktrees/1luy0po7/managed-daemon-bundle/packages/desktop/src-tauri/resources/.gitkeep)

## Acceptance Check

- Stable outer shim: covered by runtime-manager tests that assert the outer shim forwards to a stable inner launcher and does not encode runtime-specific roots.
- Inner launcher: implemented inside the managed runtime tree and invoked directly by the outer shim.
- Structured install results: implemented in Rust and parsed in TypeScript without string matching.
- Permission notice and fallback modal: implemented in the desktop settings UI.
- macOS global target: `/usr/local/bin/paseo`.
- CLI host ordering: covered by CLI tests, including the non-default TCP fallback case.

## Verification

- Run `npm run typecheck`
- Run targeted tests for the CLI and desktop-managed runtime paths
- Perform a manual macOS smoke check for the privileged `/usr/local/bin/paseo` install flow

## Remaining Manual Validation

- Privileged install and uninstall prompts still need the normal on-device macOS smoke pass.
- Merge readiness depends on the branch test pass after rebasing onto `origin/main`.
