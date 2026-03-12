---
name: paseo
description: Use when entering orchestrator mode to manage agents via Paseo CLI
---

### Paseo CLI Commands

Use these CLI commands to manage agents:

```bash
# List agents (directory-scoped by default)
paseo ls                 # Only shows agents for current directory
paseo ls -g              # All agents across all projects (global)
paseo ls --json          # JSON output for parsing

# Create and run an agent (blocks until completion by default)
paseo run --mode bypass "<prompt>"
paseo run --mode bypass --name "Task Name" "<prompt>"
paseo run --mode bypass --model opus "<prompt>"
paseo run --mode full-access --provider codex "<prompt>"

# Detached mode - runs in background, returns agent ID immediately
paseo run --detach "<prompt>"
paseo run -d "<prompt>"  # Short form

# Structured output - agent returns only matching JSON
paseo run --output-schema '{"type":"object","properties":{"summary":{"type":"string"}},"required":["summary"]}' "<prompt>"
paseo run --output-schema schema.json "<prompt>"  # Or from a file
# NOTE: --output-schema blocks until completion (cannot be used with --detach)

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

### Available Models

**Claude (default provider)** - use aliases, CLI resolves to latest version:
- `--model haiku` - Fast/cheap, ONLY for tests (not for real work)
- `--model sonnet` - Default, good for most tasks
- `--model opus` - For harder reasoning, complex debugging

**Codex** (`--provider codex`):
- `--model gpt-5.4` - Latest frontier agentic coding model (default, preferred for all engineering tasks)
- `--model gpt-5.1-codex-mini` - Cheaper, faster, but less capable

### Permissions

Always launch agents fully permissioned. Use `--mode bypass` for Claude and `--mode full-access` for Codex. Control behavior through **strict prompting**, not permission modes.

### Agent Use Cases

You can run agents to:
- **Implement a task** - Spawn an agent to write code and implement features
- **Have a design discussion** - Use Codex for architecture discussions
- **Test some feature** - Run tests and verify functionality
- **Do investigation** - Research and explore the codebase
- **Review changes** - Use Codex for thorough code reviews

### Clarifying Ambiguous Requests

**CRITICAL:** When user requests are ambiguous or unclear:

1. **Research first** - Spawn an investigation agent to understand the current state
2. **Ask clarifying questions** - After research, ask the user specific questions about what they want
3. **Present options** - Offer multiple approaches with trade-offs
4. **Get explicit confirmation** - Never assume what the user wants

### Investigation vs Implementation

**CRITICAL:** When asked to investigate:

- **Investigation agents MUST NOT fix issues** - They should only identify, document, and report problems
- **Always ask for confirmation** - After investigation, present findings and ask: "Should I proceed with implementing fixes?"
- **Only implement if explicitly requested** - Don't auto-fix without user approval

### Rigorous Agent Interrogation

**CRITICAL:** Agents start with ZERO context about your task. You must always provide complete context in your initial prompt.

When working with agents, you must dig deep and challenge them rigorously:

#### For Implementation Agents

- **Don't accept surface-level completion**: Check their logs with `paseo logs <id>`
- **Trace the implementation**: Ask them to walk through the code flow step by step
- **Uncover gaps**: Send follow-up prompts with `paseo send <id> "<question>"`
  - "Show me exactly where you handle error case X"
  - "What happens if the user does Y before Z?"
  - "Walk me through the data flow from input to output"

#### For Investigation/Debugging Agents

- **Don't stop at the first answer**: Keep digging deeper
- **Explore different angles**: "What are 3 other possible causes?"
- **Request proof**: "Show me the specific code that proves this hypothesis"
- **Challenge assumptions**: "How do you know that's the root cause?"

#### For Review Agents (prefer Codex)

- **Security review**: "What are the security implications? Any OWASP vulnerabilities?"
- **Edge cases**: "What edge cases are not handled?"
- **Performance**: "Where are the performance bottlenecks?"
- **Maintainability**: "How maintainable is this code?"

### Waiting for Agents

**CRITICAL:** `paseo wait` blocks until the agent completes. Trust it.

- Agent tasks can legitimately take 10, 20, or even 30+ minutes. This is normal.
- When `paseo wait` times out, **just re-run `paseo wait <id>`** — don't panic, don't start checking logs, don't inspect status. The agent is still working.
- Do NOT poll with `paseo ls`, `paseo inspect`, or `paseo logs` in a loop to "check on" the agent. This wastes your context window and accomplishes nothing.
- Only check logs/inspect if you have a **specific reason** to believe something is wrong (e.g., you sent a prompt and got an unexpected error back).
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
# ^ Don't do this. Trust the wait.
```

### Agent Management Principles

- **Keep agents focused** - Each agent should have a clear, specific responsibility
- **You can talk to them** - Use `paseo send <id> "<prompt>"` to guide them
- **Monitor progress** - Use `paseo logs <id> -f` to stream output
- **Always provide context** - Remember: agents start with zero knowledge of your task
- **Verify work rigorously** - Don't trust, verify. Ask agents to prove their work
- **Commit frequently** - Ensure each agent commits their changes before moving on
- **Plan for quality gates** - Use Codex review agents as checkpoints
- **Run in parallel when possible** - Use `-d` flag to run multiple agents concurrently

### Common Patterns

#### Committee

When stuck or planning something hard, use the `/committee` skill. It launches two high-reasoning agents (Opus 4.6 + GPT 5.4) in parallel to do root cause analysis and produce a plan, then stays alive to review the implementation afterward.

### Composing Agents in Bash Scripts

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

# Review the combined result
paseo run --provider codex "review the API and UI implementations. DO NOT edit."
```
