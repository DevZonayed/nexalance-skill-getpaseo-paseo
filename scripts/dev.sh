#!/bin/bash
set -e

# Ensure node_modules/.bin is in PATH (for when script runs directly)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SCRIPT_DIR/../node_modules/.bin:$PATH"

# Use a temporary PASEO_HOME to avoid conflicts between dev instances
if [ -z "${PASEO_HOME}" ]; then
  export PASEO_HOME
  PASEO_HOME="$(mktemp -d "${TMPDIR:-/tmp}/paseo-dev.XXXXXX")"
  trap "rm -rf '$PASEO_HOME'" EXIT
fi

echo "══════════════════════════════════════════════════════"
echo "  Paseo Dev"
echo "══════════════════════════════════════════════════════"
echo "  Home:    ${PASEO_HOME}"
echo "══════════════════════════════════════════════════════"

# Configure the daemon for the Portless app origin and let the app bootstrap
# through the daemon's Portless URL instead of a fixed localhost port.
APP_ORIGIN="$(portless get app)"
DAEMON_ENDPOINT="$(portless get daemon | sed -E 's#^https?://##')"
export PASEO_CORS_ORIGINS="${APP_ORIGIN}"

# Run both with concurrently
# BROWSER=none prevents auto-opening browser
# EXPO_PUBLIC_LOCAL_DAEMON configures the app to auto-connect to this daemon
concurrently \
  --names "daemon,metro" \
  --prefix-colors "cyan,magenta" \
  "portless run --name daemon sh -c 'PASEO_LISTEN=0.0.0.0:\$PORT exec npm run dev:server'" \
  "cd packages/app && BROWSER=none EXPO_PUBLIC_LOCAL_DAEMON='${DAEMON_ENDPOINT}' portless run --name app npx expo start"
