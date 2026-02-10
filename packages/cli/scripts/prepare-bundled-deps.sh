#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$CLI_DIR/../.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/paseo-bundle-XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# Nested npm calls can inherit dry-run mode from a parent `npm pack --dry-run`.
# Force real pack/install here so bundled deps are materialized.
export npm_config_dry_run=false

npm --prefix "$REPO_ROOT" pack --silent --workspace=@getpaseo/relay --pack-destination "$TMP_DIR"
npm --prefix "$REPO_ROOT" pack --silent --workspace=@getpaseo/server --pack-destination "$TMP_DIR"

RELAY_TGZ="$(ls "$TMP_DIR"/getpaseo-relay-*.tgz | head -n 1)"
SERVER_TGZ="$(ls "$TMP_DIR"/getpaseo-server-*.tgz | head -n 1)"

mkdir -p "$CLI_DIR/node_modules/@getpaseo"
rm -rf "$CLI_DIR/node_modules/@getpaseo/relay" "$CLI_DIR/node_modules/@getpaseo/server"

npm --prefix "$CLI_DIR" install --no-save --no-package-lock --workspaces=false --silent "$RELAY_TGZ" "$SERVER_TGZ"

if [ -L "$CLI_DIR/node_modules/@getpaseo/relay" ] || [ -L "$CLI_DIR/node_modules/@getpaseo/server" ]; then
  echo "Expected bundled @getpaseo deps to be real directories, not symlinks." >&2
  exit 1
fi
