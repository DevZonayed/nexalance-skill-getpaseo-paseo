// Polyfill crypto.randomUUID for React Native before any other imports
import { polyfillCrypto } from "./src/polyfills/crypto";
polyfillCrypto();

// Polyfill screen.orientation for WebKitGTK (Tauri Linux) which lacks the API
import { polyfillScreenOrientation } from "./src/polyfills/screen-orientation";
polyfillScreenOrientation();

// Bridge console.log/warn/error to Tauri's log plugin so JS output appears in app.log
if ((globalThis as { __TAURI__?: unknown }).__TAURI__) {
  import("@tauri-apps/plugin-log").then(({ attachConsole }) => {
    attachConsole();
  });
}

// Configure Unistyles before Expo Router pulls in any components using StyleSheet.
import "./src/styles/unistyles";
import "expo-router/entry";
