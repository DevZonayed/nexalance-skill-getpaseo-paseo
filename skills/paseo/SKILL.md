---
name: paseo
description: Paseo CLI reference for managing agents. Load this skill whenever you need to use paseo commands.
---

## CLI Commands

```bash
# List agents (directory-scoped by default)
paseo ls                 # Only shows agents for current directory
paseo ls -g              # All agents across all projects (global)
paseo ls --json          # JSON output for parsing

# Create and run an agent (blocks until completion by default, no timeout)
paseo run --mode bypass "<prompt>"
paseo run --mode bypass --name "Task Name" "<prompt>"
paseo run --mode bypass --model opus "<prompt>"
paseo run --mode full-access --provider codex "<prompt>"

# Wait timeout - limit how long run blocks (default: no limit)
paseo run --wait-timeout 30m "<prompt>"   # Wait up to 30 minutes
paseo run --wait-timeout 1h "<prompt>"    # Wait up to 1 hour
paseo run --wait-timeout 3600 "<prompt>"  # Plain number = seconds

# Detached mode - runs in background, returns agent ID immediately
paseo run --detach "<prompt>"
paseo run -d "<prompt>"  # Short form

# Structured output - agent returns only matching JSON
paseo run --output-schema '{"type":"object","properties":{"summary":{"type":"string"}},"required":["summary"]}' "<prompt>"
paseo run --output-schema schema.json "<prompt>"  # Or from a file
# NOTE: --output-schema blocks until completion (cannot be used with --detach)
# NOTE: --wait-timeout applies to --output-schema runs too

# Worktrees - isolated git worktree for parallel feature development
paseo run --worktree feature-x "<prompt>"

# Check agent logs/output
paseo logs <agent-id>
paseo logs <agent-id> -f               # Follow (stream)
paseo logs <agent-id> --tail 10        # Last 10 entries
paseo logs <agent-id> --filter tools   # Only tool calls

# Wait for agent to complete or need permission
paseo wait <agent-id>
paseo wait <agent-id> --timeout 60     # 60 second timeout

# Send follow-up prompt to running agent
paseo send <agent-id> "<prompt>"
paseo send <agent-id> --image screenshot.png "<prompt>"  # With image
paseo send <agent-id> --no-wait "<prompt>"               # Queue without waiting

# Inspect agent details
paseo inspect <agent-id>

# Interrupt an agent's current run
paseo stop <agent-id>

# Hard-delete an agent (interrupts first if needed)
paseo delete <agent-id>

# Attach to agent output stream (Ctrl+C to detach without stopping)
paseo attach <agent-id>

# Permissions management
paseo permit ls                # List pending permission requests
paseo permit allow <agent-id>  # Allow all pending for agent
paseo permit deny <agent-id> --all  # Deny all pending

# Agent mode switching
paseo agent mode <agent-id> --list   # Show available modes
paseo agent mode <agent-id> bypass   # Set bypass mode

# Output formats
paseo ls --json          # JSON output
paseo ls -q              # IDs only (quiet mode, useful for scripting)
```

## Available Models

**Claude (default provider)** — use aliases, CLI resolves to latest version:
- `--model haiku` — Fast/cheap, ONLY for tests (not for real work)
- `--model sonnet` — Default, good for most tasks
- `--model opus` — For harder reasoning, complex debugging

**Codex** (`--provider codex`):
- `--model gpt-5.4` — Latest frontier agentic coding model (default, preferred for all engineering tasks)
- `--model gpt-5.1-codex-mini` — Cheaper, faster, but less capable

## Permissions

Always launch agents fully permissioned. Use `--mode bypass` for Claude and `--mode full-access` for Codex. Control behavior through **strict prompting**, not permission modes.

## Waiting for Agents

Both `paseo run` and `paseo wait` block until the agent completes. Trust them.

- `paseo run` waits **forever** by default (no timeout). Use `--wait-timeout` to set a limit.
- `paseo wait` also waits forever by default. Use `--timeout` to set a limit.
- Agent tasks can legitimately take 10, 20, or even 30+ minutes. This is normal.
- When a wait times out, **just re-run `paseo wait <id>`** — don't panic, don't start checking logs, don't inspect status. The agent is still working.
- Do NOT poll with `paseo ls`, `paseo inspect`, or `paseo logs` in a loop to "check on" the agent.
- Only check logs/inspect if you have a **specific reason** to believe something is wrong.
- **Never launch a duplicate agent** because a wait timed out. The original is still running.

```bash
# Correct: just keep waiting
paseo wait <id>              # timed out? just run it again:
paseo wait <id>              # still going? keep waiting:
paseo wait <id> --timeout 300  # or use a longer timeout

# Wrong: anxious polling loop
paseo wait <id>    # timed out
paseo ls           # is it still running??
paseo inspect <id> # what's it doing??
paseo logs <id>    # let me check the logs!!
```

## Composing Agents in Bash

`paseo run` blocks by default and `--output-schema` returns structured JSON, making it easy to compose agents in bash loops and pipelines.

**Implement-and-verify loop:**
```bash
while true; do
  paseo run --provider codex "make the tests pass" >/dev/null

  verdict=$(paseo run --provider claude --output-schema '{"type":"object","properties":{"criteria_met":{"type":"boolean"}},"required":["criteria_met"],"additionalProperties":false}' "ensure tests all pass")
  if echo "$verdict" | jq -e '.criteria_met == true' >/dev/null; then
    echo "criteria met"
    break
  fi
done
```

**Detach + wait pattern for parallel work:**
```bash
# Kick off parallel agents
api_id=$(paseo run -d --name "API impl" "implement the API" -q)
ui_id=$(paseo run -d --name "UI impl" "implement the UI" -q)

# Wait for both to finish
paseo wait "$api_id"
paseo wait "$ui_id"
```
