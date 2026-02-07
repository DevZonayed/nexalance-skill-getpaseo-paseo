#!/usr/bin/env bash
set -euo pipefail

app_variant="${APP_VARIANT:-fast}"
metro_endpoint="${METRO_ENDPOINT:-localhost:8080}"

case "$app_variant" in
  fast)
    gradle_variant="debugOptimized"
    ;;
  debug)
    gradle_variant="debug"
    ;;
  *)
    echo "APP_VARIANT must be one of: fast, debug"
    exit 1
    ;;
esac

APP_VARIANT="$app_variant" npx expo run:android --variant="$gradle_variant"
APP_VARIANT="$app_variant" METRO_ENDPOINT="$metro_endpoint" LAUNCH_APP=1 bash ./scripts/android-configure-metro-host.sh
