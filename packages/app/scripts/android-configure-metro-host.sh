#!/usr/bin/env bash
set -euo pipefail

app_variant="${APP_VARIANT:-fast}"
metro_endpoint="${METRO_ENDPOINT:-localhost:8080}"
launch_app="${LAUNCH_APP:-1}"

case "$app_variant" in
  fast)
    package_id="sh.paseo.dev"
    app_name="Paseo Dev"
    ;;
  debug)
    package_id="sh.paseo.debug"
    app_name="Paseo Debug"
    ;;
  *)
    echo "APP_VARIANT must be one of: fast, debug"
    exit 1
    ;;
esac

if ! [[ "$metro_endpoint" =~ ^[A-Za-z0-9._-]+:[0-9]{1,5}$ ]]; then
  echo "Invalid METRO_ENDPOINT '$metro_endpoint'. Expected host:port (for example macbook:8081)."
  exit 1
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is not installed or not on PATH."
  exit 1
fi

if ! adb get-state >/dev/null 2>&1; then
  echo "No Android device detected by adb."
  exit 1
fi

metro_host="${metro_endpoint%:*}"
metro_port="${metro_endpoint##*:}"

if [[ "$metro_host" == "localhost" || "$metro_host" == "127.0.0.1" ]]; then
  if ! lsof -nP -iTCP:"${metro_port}" -sTCP:LISTEN >/dev/null 2>&1; then
    if [[ "$metro_port" == "8080" ]] && lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
      metro_endpoint="localhost:8081"
      metro_host="localhost"
      metro_port="8081"
      echo "Metro was not listening on localhost:8080; using localhost:8081."
    else
      echo "No Metro server detected on ${metro_endpoint}. Start Metro there or set METRO_ENDPOINT=host:port."
      exit 1
    fi
  fi

  adb reverse "tcp:${metro_port}" "tcp:${metro_port}" >/dev/null 2>&1 || true
fi

prefs_file="${package_id}_preferences.xml"
prefs_path="shared_prefs/${prefs_file}"
prefs_xml="<?xml version=\"1.0\" encoding=\"utf-8\" standalone=\"yes\" ?>
<map>
    <string name=\"debug_http_host\">${metro_endpoint}</string>
</map>"

adb shell run-as "$package_id" mkdir -p shared_prefs
printf '%s\n' "$prefs_xml" | adb shell run-as "$package_id" tee "$prefs_path" >/dev/null

echo "Configured ${app_name} (${package_id}) to use Metro at ${metro_endpoint}."

if [[ "$launch_app" == "1" ]]; then
  adb shell am force-stop "$package_id" >/dev/null 2>&1 || true
  adb shell monkey -p "$package_id" -c android.intent.category.LAUNCHER 1 >/dev/null
  echo "Launched ${app_name}."
fi
