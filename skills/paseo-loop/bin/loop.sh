#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: loop.sh --name NAME --target-prompt TEXT [options]

Target (required):
  --target self|new-agent        Who acts each iteration. Default: new-agent
  --target-prompt TEXT           Prompt given to the target each iteration
  --target-prompt-file PATH      Read the target prompt from a file

Target options:
  --agent-id ID                  Existing agent id for --target self
                                 Default: $PASEO_AGENT_ID
  --worker PROVIDER/MODEL        Worker agent for --target new-agent
                                 Default: codex

Verifier (optional):
  --verifier-prompt TEXT         Verification prompt evaluated after each iteration
  --verifier-prompt-file PATH    Read the verification prompt from a file
  --verifier PROVIDER/MODEL      Verifier agent. Default: claude/sonnet

Limits:
  --sleep DURATION               Sleep between iterations (e.g. 30s, 5m, 1h)
  --max-iterations N             Maximum loop iterations (default: unlimited)
  --max-time DURATION            Maximum total runtime (e.g. 30m, 2h)

Other options:
  --name NAME                    Name prefix for loop tracking (required)
  --archive                      Archive newly created agents after each iteration
  --worktree NAME                Run new agents in this worktree
  --thinking LEVEL               Thinking level for new-agent worker (default: medium)
EOF
  exit 1
}

parse_agent_spec() {
  local spec="$1"
  local default_provider="$2"
  local default_model="$3"

  if [[ -z "$spec" ]]; then
    echo "$default_provider" "$default_model"
    return
  fi

  if [[ "$spec" == */* ]]; then
    echo "${spec%%/*}" "${spec#*/}"
  else
    echo "$spec" ""
  fi
}

parse_duration_to_seconds() {
  local raw="$1"
  if [[ -z "$raw" ]]; then
    echo "Error: duration cannot be empty" >&2
    exit 1
  fi

  if [[ "$raw" =~ ^[0-9]+$ ]]; then
    echo "$raw"
    return
  fi

  if [[ "$raw" =~ ^([0-9]+)(s|m|h|d)$ ]]; then
    local value="${BASH_REMATCH[1]}"
    local unit="${BASH_REMATCH[2]}"
    case "$unit" in
      s) echo "$value" ;;
      m) echo $((value * 60)) ;;
      h) echo $((value * 3600)) ;;
      d) echo $((value * 86400)) ;;
      *)
        echo "Error: unsupported duration unit: $unit" >&2
        exit 1
        ;;
    esac
    return
  fi

  echo "Error: invalid duration: $raw (use Ns, Nm, Nh, Nd, or seconds)" >&2
  exit 1
}

load_prompt() {
  local inline_value="$1"
  local file_value="$2"
  local label="$3"
  local required="$4"

  if [[ -n "$inline_value" && -n "$file_value" ]]; then
    echo "Error: use either --${label} or --${label}-file, not both"
    usage
  fi

  if [[ -n "$file_value" ]]; then
    [[ -f "$file_value" ]] || { echo "Error: --${label}-file not found: $file_value"; exit 1; }
    local file_content
    file_content="$(cat "$file_value")"
    [[ -n "$file_content" ]] || { echo "Error: --${label}-file is empty: $file_value"; exit 1; }
    printf '%s' "$file_content"
    return 0
  fi

  if [[ -n "$inline_value" ]]; then
    printf '%s' "$inline_value"
    return 0
  fi

  if [[ "$required" == "true" ]]; then
    echo "Error: either --${label} or --${label}-file is required"
    usage
  fi

  return 1
}

build_target_prompt() {
  local prompt="$1"
  local prior_reason="$2"
  local require_structured_output="$3"
  local full_prompt="$prompt"

  if [[ -n "$prior_reason" ]]; then
    full_prompt="$full_prompt

<previous-iteration-result>
The previous iteration reported the following:

$prior_reason
</previous-iteration-result>"
  fi

  if [[ "$require_structured_output" == "true" ]]; then
    full_prompt="$full_prompt

End your response with strict JSON matching:
{ \"done\": true/false, \"reason\": \"...\" }

Rules:
- Return only valid JSON
- done=true only if the loop's goal is complete
- done=false if more work is needed
- reason must briefly explain the current state"
  fi

  printf '%s' "$full_prompt"
}

extract_last_assistant_message() {
  local agent_id="$1"
  PASEO_LOOP_REPO_ROOT="$repo_root" TARGET_AGENT_ID="$agent_id" npx tsx --eval '
    import { pathToFileURL } from "node:url";

    const repoRoot = process.env.PASEO_LOOP_REPO_ROOT;
    const agentId = process.env.TARGET_AGENT_ID;
    if (!repoRoot || !agentId) {
      throw new Error("Missing repo root or agent id");
    }

    const { connectToDaemon } = await import(
      pathToFileURL(`${repoRoot}/packages/cli/src/utils/client.ts`).href
    );
    const { resolveStructuredResponseMessage } = await import(
      pathToFileURL(`${repoRoot}/packages/cli/src/commands/agent/run.ts`).href
    );

    const client = await connectToDaemon({});
    try {
      const message = await resolveStructuredResponseMessage({
        client,
        agentId,
        lastMessage: null,
      });
      if (message) {
        process.stdout.write(message);
      }
    } finally {
      await client.close();
    }
  '
}

parse_done_reason() {
  local raw="$1"
  local context_label="$2"

  if ! echo "$raw" | jq -e '.done | type == "boolean"' >/dev/null 2>&1; then
    echo "Error: ${context_label} response did not include boolean .done" >&2
    echo "$raw" >&2
    exit 1
  fi

  if ! echo "$raw" | jq -e '.reason | type == "string"' >/dev/null 2>&1; then
    echo "Error: ${context_label} response did not include string .reason" >&2
    echo "$raw" >&2
    exit 1
  fi
}

ensure_time_remaining() {
  if [[ "$max_time_seconds" -le 0 ]]; then
    return
  fi

  local now
  now="$(date +%s)"
  local elapsed=$((now - start_epoch))
  if [[ "$elapsed" -ge "$max_time_seconds" ]]; then
    echo "=== Loop exhausted: max time reached (${max_time_raw}) ==="
    exit 1
  fi
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"

target="new-agent"
max_iterations=0
max_time_raw=""
max_time_seconds=0
archive=false
worker_spec=""
verifier_spec=""
target_prompt_input=""
target_prompt_file_input=""
verifier_prompt_input=""
verifier_prompt_file_input=""
name=""
thinking="medium"
worktree=""
sleep_raw=""
sleep_seconds=0
agent_id="${PASEO_AGENT_ID:-}"
state_root="${HOME}/.paseo/loops"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) target="$2"; shift 2 ;;
    --target-prompt) target_prompt_input="$2"; shift 2 ;;
    --target-prompt-file) target_prompt_file_input="$2"; shift 2 ;;
    --agent-id) agent_id="$2"; shift 2 ;;
    --worker) worker_spec="$2"; shift 2 ;;
    --verifier-prompt) verifier_prompt_input="$2"; shift 2 ;;
    --verifier-prompt-file) verifier_prompt_file_input="$2"; shift 2 ;;
    --verifier) verifier_spec="$2"; shift 2 ;;
    --name) name="$2"; shift 2 ;;
    --max-iterations) max_iterations="$2"; shift 2 ;;
    --max-time) max_time_raw="$2"; shift 2 ;;
    --archive) archive=true; shift ;;
    --sleep) sleep_raw="$2"; shift 2 ;;
    --worktree) worktree="$2"; shift 2 ;;
    --thinking) thinking="$2"; shift 2 ;;
    --help|-h) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

case "$target" in
  self|new-agent) ;;
  *)
    echo "Error: --target must be 'self' or 'new-agent'"
    usage
    ;;
esac

target_prompt="$(load_prompt "$target_prompt_input" "$target_prompt_file_input" "target-prompt" "true")"
[[ -z "$name" ]] && { echo "Error: --name is required"; usage; }

if [[ "$target" == "self" && -z "$agent_id" ]]; then
  echo "Error: --target self requires --agent-id or \$PASEO_AGENT_ID"
  exit 1
fi

if [[ -n "$sleep_raw" ]]; then
  sleep_seconds="$(parse_duration_to_seconds "$sleep_raw")"
fi

if [[ -n "$max_time_raw" ]]; then
  max_time_seconds="$(parse_duration_to_seconds "$max_time_raw")"
fi

has_verifier=false
verifier_prompt_text=""
if [[ -n "$verifier_prompt_input" || -n "$verifier_prompt_file_input" ]]; then
  verifier_prompt_text="$(load_prompt "$verifier_prompt_input" "$verifier_prompt_file_input" "verifier-prompt" "true")"
  has_verifier=true
fi

read -r worker_provider worker_model <<< "$(parse_agent_spec "$worker_spec" "codex" "")"
read -r verifier_provider verifier_model <<< "$(parse_agent_spec "$verifier_spec" "claude" "sonnet")"

mkdir -p "$state_root"

generate_loop_id() {
  uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-' | cut -c1-6
}

loop_id="$(generate_loop_id)"
state_dir="${state_root}/${loop_id}"
while [[ -e "$state_dir" ]]; do
  loop_id="$(generate_loop_id)"
  state_dir="${state_root}/${loop_id}"
done
mkdir -p "$state_dir"

target_prompt_file="${state_dir}/target-prompt.md"
last_reason_file="${state_dir}/last_reason.md"
history_log="${state_dir}/history.log"

printf '%s\n' "$target_prompt" > "$target_prompt_file"
printf '' > "$last_reason_file"
printf '' > "$history_log"

if [[ "$has_verifier" == true ]]; then
  verifier_prompt_file="${state_dir}/verifier-prompt.md"
  printf '%s\n' "$verifier_prompt_text" > "$verifier_prompt_file"
fi

worker_flags=()
if [[ "$worker_provider" == "codex" ]]; then
  worker_flags+=(--mode full-access --provider codex)
elif [[ "$worker_provider" == "claude" ]]; then
  worker_flags+=(--mode bypassPermissions --provider claude)
fi
[[ -n "$worker_model" ]] && worker_flags+=(--model "$worker_model")
[[ -n "$thinking" ]] && worker_flags+=(--thinking "$thinking")

verifier_flags=()
if [[ "$verifier_provider" == "codex" ]]; then
  verifier_flags+=(--mode full-access --provider codex)
elif [[ "$verifier_provider" == "claude" ]]; then
  verifier_flags+=(--mode bypassPermissions --provider claude)
fi
[[ -n "$verifier_model" ]] && verifier_flags+=(--model "$verifier_model")

worktree_flags=()
if [[ -n "$worktree" ]]; then
  base_branch="$(git branch --show-current 2>/dev/null || echo "main")"
  worktree_flags+=(--worktree "$worktree" --base "$base_branch")
fi

done_schema='{"type":"object","properties":{"done":{"type":"boolean"},"reason":{"type":"string"}},"required":["done","reason"],"additionalProperties":false}'
start_epoch="$(date +%s)"
iteration=0

echo "=== Loop started: $name ==="
echo "  Loop ID: $loop_id"
echo "  State dir: $state_dir"
echo "  Target: $target"
if [[ "$target" == "self" ]]; then
  echo "  Agent ID: $agent_id"
else
  echo "  Worker: $worker_provider/${worker_model:-(default)}"
fi
echo "  Target prompt: $target_prompt_file (live-editable)"
if [[ "$has_verifier" == true ]]; then
  echo "  Verifier prompt: $verifier_prompt_file (live-editable)"
  echo "  Verifier: $verifier_provider/${verifier_model:-(default)}"
else
  echo "  Verifier: none"
fi
echo "  Last reason file: $last_reason_file"
echo "  History log: $history_log"
if [[ -n "$sleep_raw" ]]; then
  echo "  Sleep: $sleep_raw between iterations"
fi
if [[ -n "$max_time_raw" ]]; then
  echo "  Max time: $max_time_raw"
else
  echo "  Max time: unlimited"
fi
if [[ "$archive" == true ]]; then
  echo "  Archive: newly created agents archived after each iteration"
fi
if [[ -n "$worktree" ]]; then
  echo "  Worktree: $worktree (base: $base_branch)"
fi
if [[ "$max_iterations" -gt 0 ]]; then
  echo "  Max iterations: $max_iterations"
else
  echo "  Max iterations: unlimited"
fi
echo ""

while [[ "$max_iterations" -eq 0 || "$iteration" -lt "$max_iterations" ]]; do
  ensure_time_remaining

  iteration=$((iteration + 1))
  if [[ "$max_iterations" -gt 0 ]]; then
    echo "--- Iteration $iteration/$max_iterations ---"
  else
    echo "--- Iteration $iteration ---"
  fi

  if [[ ! -s "$target_prompt_file" ]]; then
    echo "Error: target prompt file is missing or empty: $target_prompt_file"
    exit 1
  fi

  current_target_prompt="$(cat "$target_prompt_file")"
  last_reason="$(cat "$last_reason_file" 2>/dev/null || true)"

  target_needs_structured_output=false
  if [[ "$has_verifier" == false ]]; then
    target_needs_structured_output=true
  fi

  full_target_prompt="$(build_target_prompt "$current_target_prompt" "$last_reason" "$target_needs_structured_output")"

  if [[ "$target" == "new-agent" ]]; then
    worker_name="${name}-${iteration}"

    if [[ "$has_verifier" == true ]]; then
      echo "Launching worker: $worker_name"
      worker_id=$(paseo run -d "${worker_flags[@]}" "${worktree_flags[@]}" --name "$worker_name" "$full_target_prompt" -q)
      echo "Worker [$worker_name] launched. ID: $worker_id"
      echo "  Stream logs:  paseo logs $worker_id -f"
      echo "  Inspect:      paseo inspect $worker_id"

      echo ""
      echo "Waiting for worker to complete..."
      paseo wait "$worker_id"
      echo "Worker done."

      if [[ "$archive" == true ]]; then
        paseo agent archive "$worker_name" 2>/dev/null || true
      fi
    else
      echo "Launching worker: $worker_name"
      verdict=$(paseo run "${worker_flags[@]}" "${worktree_flags[@]}" --name "$worker_name" --output-schema "$done_schema" "$full_target_prompt")
      echo "Result: $verdict"
      parse_done_reason "$verdict" "worker"
      done_value=$(echo "$verdict" | jq -r '.done')
      reason=$(echo "$verdict" | jq -r '.reason')

      if [[ "$archive" == true ]]; then
        paseo agent archive "$worker_name" 2>/dev/null || true
      fi

      printf '[%s] iteration=%s target=%s target_agent=%s done=%s reason=%s\n' \
        "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        "$iteration" \
        "$target" \
        "$worker_name" \
        "$done_value" \
        "$(echo "$reason" | tr '\n' ' ')" >> "$history_log"
    fi
  else
    iteration_label="self:${agent_id}"
    iteration_prompt_file="$(mktemp)"
    trap 'rm -f "$iteration_prompt_file"' EXIT
    printf '%s\n' "$full_target_prompt" > "$iteration_prompt_file"

    echo "Sending iteration prompt to existing agent: $agent_id"
    paseo send "$agent_id" --prompt-file "$iteration_prompt_file" >/dev/null
    rm -f "$iteration_prompt_file"
    trap - EXIT

    if [[ "$has_verifier" == false ]]; then
      verdict="$(extract_last_assistant_message "$agent_id")"
      echo "Result: $verdict"
      parse_done_reason "$verdict" "self target"
      done_value=$(echo "$verdict" | jq -r '.done')
      reason=$(echo "$verdict" | jq -r '.reason')

      printf '[%s] iteration=%s target=%s target_agent=%s done=%s reason=%s\n' \
        "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        "$iteration" \
        "$target" \
        "$iteration_label" \
        "$done_value" \
        "$(echo "$reason" | tr '\n' ' ')" >> "$history_log"
    fi
  fi

  if [[ "$has_verifier" == true ]]; then
    current_verifier_prompt="$(cat "$verifier_prompt_file")"
    verifier_name="${name}-verify-${iteration}"
    full_verifier_prompt="$current_verifier_prompt

Respond with strict JSON matching:
{ \"done\": true/false, \"reason\": \"...\" }

Rules:
- done=true only if the loop goal has been met
- done=false if another iteration is needed
- reason must explain what you found with evidence"

    echo ""
    echo "Launching verifier: $verifier_name"
    verdict=$(paseo run "${verifier_flags[@]}" "${worktree_flags[@]}" --name "$verifier_name" --output-schema "$done_schema" "$full_verifier_prompt")
    echo "Verdict: $verdict"
    parse_done_reason "$verdict" "verifier"
    done_value=$(echo "$verdict" | jq -r '.done')
    reason=$(echo "$verdict" | jq -r '.reason')

    if [[ "$archive" == true ]]; then
      paseo agent archive "$verifier_name" 2>/dev/null || true
    fi

    if [[ "$target" == "new-agent" ]]; then
      target_label="$worker_name"
    else
      target_label="self:${agent_id}"
    fi

    printf '[%s] iteration=%s target=%s target_agent=%s verifier=%s done=%s reason=%s\n' \
      "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
      "$iteration" \
      "$target" \
      "$target_label" \
      "$verifier_name" \
      "$done_value" \
      "$(echo "$reason" | tr '\n' ' ')" >> "$history_log"
  fi

  if [[ "$done_value" == "true" ]]; then
    echo ""
    echo "=== Loop complete: done on iteration $iteration ==="
    echo "Reason: $reason"
    exit 0
  fi

  echo "Not done: $reason"
  printf '%s\n' "$reason" > "$last_reason_file"

  ensure_time_remaining
  if [[ "$sleep_seconds" -gt 0 ]] && [[ "$max_iterations" -eq 0 || "$iteration" -lt "$max_iterations" ]]; then
    echo "Sleeping $sleep_raw before next iteration..."
    sleep "$sleep_seconds"
  fi

  echo ""
done

echo "=== Loop exhausted: $max_iterations iterations without completing ==="
exit 1
