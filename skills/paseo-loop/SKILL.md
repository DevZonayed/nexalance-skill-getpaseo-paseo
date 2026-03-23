---
name: paseo-loop
description: Run an agent loop until an exit condition is met. Use when the user says "loop", "babysit", "keep trying until", "check every X", "watch", or wants iterative autonomous execution.
user-invocable: true
---

# Paseo Loop Skill

You are setting up `/paseo-loop` as a flexible loop primitive.

Think of it like a `while` loop:
- each iteration sends work to a target
- an optional verifier judges completion
- optional sleep schedules the next iteration
- hard caps stop the loop if it runs too long

**User's arguments:** $ARGUMENTS

---

## Prerequisites

Load the **Paseo skill** first. It contains the CLI reference for `paseo run`, `paseo send`, `paseo wait`, and related commands.

## Core Model

Every loop has these parts:

1. **Target**: who acts each iteration
2. **Prompt**: what the target does each iteration
3. **Verifier**: optional independent judge
4. **Sleep**: optional pause between iterations
5. **Stop conditions**: max iterations and/or max total runtime

### Target

There are two target modes:

#### `self`

The loop sends the prompt back to the current agent each iteration. The current agent is identified by `$PASEO_AGENT_ID`.

Use `self` when:
- the current agent should keep ownership of the task
- the user says "babysit", "watch", "check every X", "poll", or "monitor"
- waking the same agent is cheaper and more natural than starting fresh

#### `new-agent`

The loop launches a fresh worker agent each iteration.

Use `new-agent` when:
- the user says "create a loop", "spin up a loop", or "launch a codex agent"
- the task benefits from fresh context per iteration
- you want isolated retries, often in a worktree

### Verifier

The verifier is orthogonal to the target:
- no verifier: the target decides whether the loop is done
- verifier present: the verifier decides whether the loop is done

If a verifier exists, it is the source of truth for loop completion.

## Defaults by User Intent

Infer defaults from the user's phrasing:

### Babysit / watch / check every X

Default to:
- `target=self`
- `sleep=<explicit value or sensible default>`
- no verifier unless the user asks for independent verification
- `max-time=1h` if the user gives no bound and the task could run indefinitely

### Ensure X is done

Default to:
- `target=self`
- verifier enabled
- no sleep unless the task is waiting on an external system

Reason: by default, do not trust the same agent to judge its own completion when the user is asking for assurance.

### Create a loop / launch a loop / loop a codex agent

Default to:
- `target=new-agent`
- verifier enabled when success criteria need independent judgment
- worktree enabled when code changes are involved

## Stop Conditions

Support both:
- `--max-iterations N`
- `--max-time DURATION`

Use at least one bound for open-ended or polling loops when the user does not specify one.

## Feedback Between Iterations

Each iteration should receive the previous result as `<previous-iteration-result>`.

This applies in all cases:
- if there is a verifier, feed back the verifier's `reason`
- otherwise feed back the target's `reason`

## Live Steering

Each loop persists state in:

```text
~/.paseo/loops/<loop-id>/
  target-prompt.md       # prompt sent to self or worker (live-editable)
  verifier-prompt.md     # verifier prompt (live-editable, optional)
  last_reason.md         # latest reason used for feedback
  history.log            # per-iteration records
```

Edits to prompt files are picked up on the next iteration without restarting the loop.

## Script Interface

The loop is implemented at:

```bash
skills/paseo-loop/bin/loop.sh
```

### Flags

| Flag | Required | Default | Description |
|---|---|---|---|
| `--target self|new-agent` | No | inferred / `new-agent` in raw script | Who acts each iteration |
| `--target-prompt` | Yes* | — | Prompt given to the target each iteration |
| `--target-prompt-file` | Yes* | — | Read the target prompt from a file |
| `--worker` | No | `codex` | Worker agent for `new-agent` loops |
| `--agent-id` | No | `$PASEO_AGENT_ID` | Existing agent id for `self` loops |
| `--verifier-prompt` | No* | — | Prompt for an independent verifier |
| `--verifier-prompt-file` | No* | — | Read verifier prompt from a file |
| `--verifier` | No | `claude/sonnet` | Verifier agent |
| `--name` | Yes | — | Name prefix for loop tracking |
| `--sleep` | No | — | Delay between iterations |
| `--max-iterations` | No | unlimited | Hard cap on iteration count |
| `--max-time` | No | unlimited | Hard cap on total wall-clock runtime |
| `--archive` | No | off | Archive newly created agents after iteration |
| `--worktree` | No | — | Worktree name for `new-agent` loops |
| `--thinking` | No | `medium` | Thinking level for worker |

\* Provide exactly one of `--target-prompt` or `--target-prompt-file`. Provide at most one of `--verifier-prompt` or `--verifier-prompt-file`.

## Behavior Rules

### `target=self`, no verifier

The current agent must return structured JSON:

```json
{ "done": true, "reason": "..." }
```

Use this for:
- babysitting a PR
- scheduled status checks
- monitoring a deployment
- repeating an objective task the current agent can judge itself

### `target=self`, verifier enabled

The current agent does the work. A separate verifier decides whether the loop is done.

Use this for:
- "ensure X is done"
- "work until the tests are passing"
- cases where the user wants independent judgment but keeping the same agent is still the right execution model

### `target=new-agent`, no verifier

A fresh worker launches each iteration and must return structured JSON itself.

Use this when:
- the task is naturally self-judging
- you want fresh context each retry

### `target=new-agent`, verifier enabled

A fresh worker launches each iteration. After it finishes, a separate verifier judges completion.

Use this for:
- implementation loops
- fix-and-verify cycles
- loops the user explicitly asks you to create

## Examples

### Babysit the PR

Interpretation:
- `target=self`
- `sleep=2m`
- no verifier unless requested
- reasonable `max-time` if none given

Example:

```bash
skills/paseo-loop/bin/loop.sh \
  --target self \
  --target-prompt "Check PR #42. Review CI, review comments, and branch status. Fix issues as they arise. Return JSON with done=true only when the PR is fully green and ready." \
  --sleep 2m \
  --max-time 1h \
  --name babysit-pr-42
```

### Launch a Codex agent to babysit the PR

Interpretation:
- `target=new-agent`
- `worker=codex`
- `sleep=2m`
- usually archive

```bash
skills/paseo-loop/bin/loop.sh \
  --target new-agent \
  --worker codex \
  --target-prompt "Check PR #42. Review CI, review comments, and branch status. Fix issues as they arise. Return JSON with done=true only when the PR is fully green and ready." \
  --sleep 2m \
  --max-time 1h \
  --archive \
  --name babysit-pr-42
```

### Work until the tests are passing

Interpretation:
- `target=self`
- verifier enabled
- no sleep

```bash
skills/paseo-loop/bin/loop.sh \
  --target self \
  --target-prompt "Run the test suite, investigate failures, and fix the code. Stop after you have made a coherent attempt for this iteration." \
  --verifier-prompt "Run the relevant test suite. Return done=true only if all tests pass. Reason must cite the exact command and outcome." \
  --max-iterations 10 \
  --name fix-tests
```

### Create a loop to fix the tests

Interpretation:
- `target=new-agent`
- verifier enabled
- often use a worktree

```bash
skills/paseo-loop/bin/loop.sh \
  --target new-agent \
  --worker codex \
  --target-prompt "Run the test suite, investigate failures, fix the code, and leave the repo in a clean verifiable state for this iteration." \
  --verifier-prompt "Run the relevant test suite. Return done=true only if all tests pass. Reason must cite the exact command and outcome." \
  --worktree fix-tests \
  --max-iterations 10 \
  --name fix-tests
```

### Loop a Codex agent to complete issue 456 in a worktree

Interpretation:
- `target=new-agent`
- worker codex
- verifier enabled
- worktree enabled

```bash
skills/paseo-loop/bin/loop.sh \
  --target new-agent \
  --worker codex \
  --target-prompt "Implement issue #456 in this repo. Use the issue description and surrounding code as context. Make incremental progress each iteration and leave clear evidence of what changed." \
  --verifier-prompt "Verify issue #456 is complete. Check changed files, run typecheck and relevant tests, and return done=true only if the implementation meets the issue requirements with evidence." \
  --worktree issue-456 \
  --max-iterations 8 \
  --max-time 2h \
  --name issue-456
```

## Your Job

1. Understand the user's intent from the conversation and `$ARGUMENTS`
2. Decide `target=self` or `target=new-agent`
3. Decide whether a verifier is needed
4. Write the target prompt so it is self-contained for the selected target
5. Write the verifier prompt, if used, so it is factual and evidence-based
6. Choose sleep only when the task is naturally scheduled or polling
7. Add sensible stop conditions
8. Choose worker / verifier agents
9. Choose a short name
10. Run `skills/paseo-loop/bin/loop.sh` with the final arguments

## Prompt Writing Rules

### Target prompt

The target prompt must be:
- self-contained
- concrete about commands, files, branches, tests, PRs, or systems to inspect
- explicit about what counts as progress this iteration

If there is no verifier, the target prompt must instruct the target to end with strict JSON matching:

```json
{ "done": boolean, "reason": "string" }
```

### Verifier prompt

The verifier prompt should:
- check facts, not offer fixes
- cite commands, outputs, or file evidence
- return strict JSON matching:

```json
{ "done": boolean, "reason": "string" }
```

## Skill Stacking

The target prompt can instruct the worker to use other skills:

```bash
skills/paseo-loop/bin/loop.sh \
  --target new-agent \
  --target-prompt "Use /committee first if you are stuck, then fix the provider list bug." \
  --verifier-prompt "Verify the provider list renders correctly and typecheck passes." \
  --name provider-fix
```
