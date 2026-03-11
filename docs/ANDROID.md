# Android

## App variants

Controlled by `APP_VARIANT` in `packages/app/app.config.js` (vanilla Expo, no custom Gradle plugin):

| Variant | App name | Package ID |
|---|---|---|
| `production` | Paseo | `sh.paseo` |
| `development` | Paseo Debug | `sh.paseo.debug` |

EAS profiles: `development`, `production`, and `production-apk` in `packages/app/eas.json`.

`development` uses Android `debug`.

## Local build + install

From repo root:

```bash
npm run android:development    # Debug build
npm run android:production     # Release build
npm run android:clean          # Clean native project
```

Or from `packages/app`:

```bash
# Debug
APP_VARIANT=development npx expo prebuild --platform android --non-interactive
APP_VARIANT=development npx expo run:android --variant=debug

# Release
APP_VARIANT=production npx expo prebuild --platform android --non-interactive
APP_VARIANT=production npx expo run:android --variant=release

# Clean
npx expo prebuild --platform android --clean --non-interactive
```

## Screenshots

```bash
adb exec-out screencap -p > screenshot.png
```

## Cloud build + submit (EAS)

Tag pushes like `v0.1.0` trigger:

- `packages/app/.eas/workflows/release-mobile.yml` on Expo servers (iOS + Android build + submit)
- `.github/workflows/android-apk-release.yml` on GitHub Actions (APK asset on GitHub Release)

### Useful commands

```bash
cd packages/app

# List recent workflow runs
npx eas workflow:runs --workflow release-mobile.yml --limit 10

# Inspect a run
npx eas workflow:view <run-id>

# Stream logs for a failed job
npx eas workflow:logs <job-id> --non-interactive --all-steps
```
