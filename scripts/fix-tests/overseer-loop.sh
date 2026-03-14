#!/usr/bin/env bash
set -euo pipefail

AGENT_ID="${1:-a5e75793-2e97-40dd-a38e-0150022b7e54}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/overseer.md"
INTERVAL="${2:-1800}" # 30 minutes

echo "=== Overseer loop ==="
echo "  Agent: $AGENT_ID"
echo "  Prompt: $PROMPT_FILE"
echo "  Interval: ${INTERVAL}s"
echo ""

iteration=0
while true; do
  iteration=$((iteration + 1))
  echo "--- Overseer check #$iteration ($(date)) ---"
  paseo send "$AGENT_ID" --prompt-file "$PROMPT_FILE" || echo "Send failed, will retry next cycle"
  echo ""
  sleep "$INTERVAL"
done
