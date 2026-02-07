#!/usr/bin/env bash
set -euo pipefail

app_variant="${APP_VARIANT:-fast}"

case "$app_variant" in
  fast)
    gradle_task="app:assembleDebugOptimized"
    apk_path="android/app/build/outputs/apk/debugOptimized/app-debugOptimized.apk"
    ;;
  debug)
    gradle_task="app:assembleDebug"
    apk_path="android/app/build/outputs/apk/debug/app-debug.apk"
    ;;
  *)
    echo "APP_VARIANT must be one of: fast, debug"
    exit 1
    ;;
esac

APP_VARIANT="$app_variant" npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew "$gradle_task")

echo "Built APK: ${apk_path}"
