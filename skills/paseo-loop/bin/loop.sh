#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: loop.sh --worker-prompt TEXT --name NAME [options]

Worker (required):
  --worker-prompt TEXT          Prompt given to the worker agent each iteration
  --worker-prompt-file PATH     Read the worker prompt from a file
  --worker PROVIDER/MODEL       Worker agent (e.g. codex, codex/gpt-5.4, claude/sonnet). Default: codex

Verifier (optional):
  --verifier-prompt TEXT        Verification prompt evaluated by a separate agent after each iteration
  --verifier-prompt-file PATH   Read the verification prompt from a file
  --verifier PROVIDER/MODEL     Verifier agent (e.g. claude/sonnet, codex/gpt-5.4). Default: claude/sonnet

  When a verifier prompt is provided, a separate verifier agent evaluates the
  condition after each worker iteration. When omitted, the worker itself returns
  { done: boolean, reason: string } and decides when the loop is done.

Options:
  --name NAME             Name prefix for agents (required)
  --sleep DURATION        Sleep between iterations (e.g. 30s, 5m, 1h). Default: no delay.
  --max-iterations N      Maximum loop iterations (default: unlimited)
  --archive               Archive agents after each iteration
  --worktree NAME         Run all agents in this worktree (created on first use, reused after)
  --thinking LEVEL        Thinking level for worker (default: medium)
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

# Defaults
max_iterations=0
archive=false
worker_spec=""
verifier_spec=""
worker_prompt_input=""
worker_prompt_file_input=""
verifier_prompt_input=""
verifier_prompt_file_input=""
name=""
thinking="medium"
worktree=""
sleep_duration=""
state_root="${HOME}/.paseo/loops"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --worker-prompt) worker_prompt_input="$2"; shift 2 ;;
    --worker-prompt-file) worker_prompt_file_input="$2"; shift 2 ;;
    --worker) worker_spec="$2"; shift 2 ;;
    --verifier-prompt) verifier_prompt_input="$2"; shift 2 ;;
    --verifier-prompt-file) verifier_prompt_file_input="$2"; shift 2 ;;
    --verifier) verifier_spec="$2"; shift 2 ;;
    --name) name="$2"; shift 2 ;;
    --max-iterations) max_iterations="$2"; shift 2 ;;
    --archive) archive=true; shift ;;
    --sleep) sleep_duration="$2"; shift 2 ;;
    --worktree) worktree="$2"; shift 2 ;;
    --thinking) thinking="$2"; shift 2 ;;
    --help|-h) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

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

worker_prompt="$(load_prompt "$worker_prompt_input" "$worker_prompt_file_input" "worker-prompt" "true")"
[[ -z "$name" ]] && { echo "Error: --name is required"; usage; }

# Load verifier prompt if provided (optional)
has_verifier=false
verifier_prompt_text=""
if [[ -n "$verifier_prompt_input" || -n "$verifier_prompt_file_input" ]]; then
  verifier_prompt_text="$(load_prompt "$verifier_prompt_input" "$verifier_prompt_file_input" "verifier-prompt" "true")"
  has_verifier=true
fi

# Parse agent specs
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

prompt_file="${state_dir}/worker-prompt.md"
last_reason_file="${state_dir}/last_reason.md"
history_log="${state_dir}/history.log"

printf '%s\n' "$worker_prompt" > "$prompt_file"
printf '' > "$last_reason_file"
printf '' > "$history_log"

if [[ "$has_verifier" == true ]]; then
  verifier_prompt_file="${state_dir}/verifier-prompt.md"
  printf '%s\n' "$verifier_prompt_text" > "$verifier_prompt_file"
fi

# Build worker flags
worker_flags=()
if [[ "$worker_provider" == "codex" ]]; then
  worker_flags+=(--mode full-access --provider codex)
elif [[ "$worker_provider" == "claude" ]]; then
  worker_flags+=(--mode bypassPermissions)
fi
[[ -n "$worker_model" ]] && worker_flags+=(--model "$worker_model")
[[ -n "$thinking" ]] && worker_flags+=(--thinking "$thinking")

# Build verifier flags
verifier_flags=()
if [[ "$verifier_provider" == "codex" ]]; then
  verifier_flags+=(--mode full-access --provider codex)
elif [[ "$verifier_provider" == "claude" ]]; then
  verifier_flags+=(--mode bypassPermissions)
fi
[[ -n "$verifier_model" ]] && verifier_flags+=(--model "$verifier_model")

# Worktree flags — passed to every paseo run call
worktree_flags=()
if [[ -n "$worktree" ]]; then
  base_branch="$(git branch --show-current 2>/dev/null || echo "main")"
  worktree_flags+=(--worktree "$worktree" --base "$base_branch")
fi

# Structured output schema
done_schema='{"type":"object","properties":{"done":{"type":"boolean"},"reason":{"type":"string"}},"required":["done","reason"],"additionalProperties":false}'

iteration=0

echo "=== Loop started: $name ==="
echo "  Loop ID: $loop_id"
echo "  State dir: $state_dir"
echo "  Worker prompt: $prompt_file (live-editable)"
if [[ "$has_verifier" == true ]]; then
  echo "  Verifier prompt: $verifier_prompt_file (live-editable)"
  echo "  Mode: worker + verifier"
else
  echo "  Mode: self-terminating worker"
fi
echo "  Last reason file: $last_reason_file"
echo "  History log: $history_log"
echo "  Worker: $worker_provider/${worker_model:-(default)}"
if [[ "$has_verifier" == true ]]; then
  echo "  Verifier: $verifier_provider/${verifier_model:-(default)}"
fi
if [[ -n "$sleep_duration" ]]; then
  echo "  Sleep: $sleep_duration between iterations"
fi
if [[ "$archive" == true ]]; then
  echo "  Archive: agents archived after each iteration"
fi
if [[ -n "$worktree" ]]; then
  echo "  Worktree: $worktree (base: $base_branch)"
fi
if [[ $max_iterations -gt 0 ]]; then
  echo "  Max iterations: $max_iterations"
else
  echo "  Max iterations: unlimited"
fi
echo ""

while [[ $max_iterations -eq 0 || $iteration -lt $max_iterations ]]; do
  iteration=$((iteration + 1))
  if [[ $max_iterations -gt 0 ]]; then
    echo "--- Iteration $iteration/$max_iterations ---"
  else
    echo "--- Iteration $iteration ---"
  fi

  if [[ ! -s "$prompt_file" ]]; then
    echo "Error: worker prompt file is missing or empty: $prompt_file"
    exit 1
  fi

  current_prompt="$(cat "$prompt_file")"
  last_reason="$(cat "$last_reason_file" 2>/dev/null || true)"

  # Build the full worker prompt
  full_worker_prompt="$current_prompt"

  if [[ -n "$last_reason" ]]; then
    full_worker_prompt="$full_worker_prompt

<previous-iteration-result>
The previous iteration reported the following:

$last_reason
</previous-iteration-result>"
  fi

  worker_name="${name}-${iteration}"

  if [[ "$has_verifier" == true ]]; then
    # --- Mode: worker + separate verifier ---

    # Worker runs detached (no structured output)
    echo "Launching worker: $worker_name"
    worker_id=$(paseo run -d "${worker_flags[@]}" "${worktree_flags[@]}" --name "$worker_name" "$full_worker_prompt" -q)
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

    # Re-read verifier prompt for live steering
    current_verifier_prompt="$(cat "$verifier_prompt_file")"

    # Verifier runs synchronously with structured output
    verifier_name="${name}-verify-${iteration}"
    full_verifier_prompt="$current_verifier_prompt

Respond with { \"done\": true/false, \"reason\": \"...\" }.
- done: true if the condition is met, false otherwise
- reason: explain what you found with evidence"

    echo ""
    echo "Launching verifier: $verifier_name"
    verdict=$(paseo run "${verifier_flags[@]}" "${worktree_flags[@]}" --name "$verifier_name" --output-schema "$done_schema" "$full_verifier_prompt")
    echo "Verdict: $verdict"

    done_value=$(echo "$verdict" | jq -r '.done')
    reason=$(echo "$verdict" | jq -r '.reason')

    if [[ "$archive" == true ]]; then
      paseo agent archive "$verifier_name" 2>/dev/null || true
    fi

    printf '[%s] iteration=%s worker=%s verifier=%s done=%s reason=%s\n' \
      "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
      "$iteration" \
      "$worker_name" \
      "$verifier_name" \
      "$done_value" \
      "$(echo "$reason" | tr '\n' ' ')" >> "$history_log"

  else
    # --- Mode: self-terminating worker ---

    # Worker runs synchronously with structured output
    echo "Launching worker: $worker_name"
    verdict=$(paseo run "${worker_flags[@]}" "${worktree_flags[@]}" --name "$worker_name" --output-schema "$done_schema" "$full_worker_prompt")
    echo "Result: $verdict"

    done_value=$(echo "$verdict" | jq -r '.done')
    reason=$(echo "$verdict" | jq -r '.reason')

    if [[ "$archive" == true ]]; then
      paseo agent archive "$worker_name" 2>/dev/null || true
    fi

    printf '[%s] iteration=%s worker=%s done=%s reason=%s\n' \
      "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
      "$iteration" \
      "$worker_name" \
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

  if [[ -n "$sleep_duration" ]] && [[ $max_iterations -eq 0 || $iteration -lt $max_iterations ]]; then
    echo "Sleeping $sleep_duration before next iteration..."
    sleep "$sleep_duration"
  fi

  echo ""
done

echo "=== Loop exhausted: $max_iterations iterations without completing ==="
exit 1
