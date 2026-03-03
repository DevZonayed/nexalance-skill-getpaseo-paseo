# Workspace Source-Of-Truth Cleanup Plan

## Scope

Only this worktree:
`/Users/moboudra/.paseo/worktrees/1luy0po7/workspace-sot-hard-cut`

## Objectives

1. One server-owned source of truth for workspace identity.
2. Header and sidebar render the same workspace name field.
3. Remove client-side workspace construction from agent data.
4. Hard cut legacy paths (no dual-read compatibility layer).

## Non-Objectives

1. No UI-only taxonomy in canonical model (`subtitle`, `titleKind`).
2. No React derivation from branch/path basename for workspace naming.
3. No silent fallbacks masking missing state (`?? ""`, cwd fallback label).

## Phase 0: Audit Existing Worktree Changes

1. Inventory all modified files in this worktree.
2. For each hunk, classify as `keep`, `delete`, or `rewrite`.
3. Build a bad-pattern list and remove all of these:
- Workspace naming fallback in React.
- Canonical payload fields that are presentation-only.
- Any primary label logic equivalent to `Unknown branch`.
- Any sidebar workspace list constructed from live agent rows.

### Acceptance

1. Full inventory exists before further refactor work.
2. Every bad pattern has a mapped removal location.

## Phase 1: Canonical Model Simplification

Define a minimal server canonical workspace entity:

- `id`: normalized cwd (single identity field)
- `projectId`: stable grouping key
- `name`: canonical workspace name (server computed)
- `status`: dominant state bucket
- `activityAt`: nullable ISO timestamp

Do not include UI/presentation fields in canonical payload.

### Acceptance

1. No duplicate identity fields (`workspaceId` + `cwd`) in canonical contract.
2. No subtitle/title-kind fields in canonical contract.

## Phase 2: Server Aggregation and RPC

1. Build workspace aggregation in `session.ts` from authoritative server state.
2. Compute workspace `name` once in server policy code.
3. Provide:
- `fetch_workspaces_request/response` snapshot RPC
- `workspace_update` incremental upsert/remove stream
4. Keep update semantics aligned with existing directory subscription behavior.

### Acceptance

1. Non-git and git workspaces both resolve deterministic `name`.
2. No `Unknown branch` emitted by server.
3. Workspace update stream reflects agent lifecycle/state changes.

## Phase 3: Client Store Wiring

1. Add workspace map in session store keyed by canonical `id`.
2. Hydrate only from `fetch_workspaces`.
3. Apply only `workspace_update` events for incremental updates.
4. Keep workspace state channel separate from agent-list derivation.

### Acceptance

1. Workspace map is populated strictly from workspace RPCs.
2. No workspace assembly logic from agent lists in runtime/store.

## Phase 4: UI Hard Cut

1. Sidebar row label reads only `workspace.name`.
2. Header title reads only `workspace.name`.
3. Remove all local workspace naming helpers based on cwd/branch.
4. Missing descriptor after hydration must render explicit missing-state UI, not fallback text.

### Acceptance

1. Header and sidebar names are guaranteed identical source field.
2. No `?? ""`/cwd/branch fallback paths for workspace name.

## Phase 5: Legacy Deletion

1. Delete prior client sidebar workspace-building path(s).
2. Remove `Unknown branch` primary naming logic.
3. Remove any query/helper used only for old workspace naming.
4. Delete dead types/helpers from failed intermediate designs.

### Acceptance

1. No app code path builds workspace rows from agent lists.
2. Legacy naming/building code fully removed in same change set.

## Phase 6: Verification

1. Protocol/schema tests for workspace request/response/update.
2. Server aggregation tests:
- non-git workspace
- git branch workspace
- detached/headless workspace
- removal/update behavior
3. UI tests:
- selected workspace header name equals sidebar workspace name
- explicit missing-state rendering when descriptor absent post-hydration
4. Run `npm run typecheck`.
5. Manual validation in this worktree daemon+expo stack.

### Acceptance

1. Tests pass.
2. Typecheck passes.
3. Manual verification confirms name parity and status correctness.

## Execution Guardrails

1. Work only in `workspace-sot-hard-cut`.
2. No destructive git operations.
3. No fallback naming logic in React.
4. One naming policy and source of truth: server.
5. Hard cut means old code removed, not left dormant.
