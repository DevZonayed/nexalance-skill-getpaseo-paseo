#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOOP="$HOME/.claude/skills/paseo-loop/bin/loop.sh"

echo "=== Launching fix-tests loops ==="
echo "  App realm:    worktree fix-tests-app"
echo "  Server realm: worktree fix-tests-server"
echo ""

# Launch both loops in parallel
"$LOOP" \
  --worker-prompt-file "$SCRIPT_DIR/worker-app.md" \
  --verifier-prompt-file "$SCRIPT_DIR/verifier.md" \
  --worker codex/gpt-5.4 \
  --verifier claude/sonnet \
  --name "fix-app" \
  --worktree "fix-tests-app" \
  --thinking medium \
  --archive &
app_pid=$!

"$LOOP" \
  --worker-prompt-file "$SCRIPT_DIR/worker-server.md" \
  --verifier-prompt-file "$SCRIPT_DIR/verifier.md" \
  --worker codex/gpt-5.4 \
  --verifier claude/sonnet \
  --name "fix-server" \
  --worktree "fix-tests-server" \
  --thinking medium \
  --archive &
server_pid=$!

echo "App loop PID:    $app_pid"
echo "Server loop PID: $server_pid"
echo ""
echo "Logs:  ~/.paseo/loops/"
echo "Kill:  kill $app_pid $server_pid"
echo ""

wait $app_pid && echo "App realm: DONE" || echo "App realm: EXITED ($?)"
wait $server_pid && echo "Server realm: DONE" || echo "Server realm: EXITED ($?)"
