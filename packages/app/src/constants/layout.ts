import { Platform } from "react-native";
import { isDesktop, isDesktopMac } from "@/desktop/host";

export const FOOTER_HEIGHT = 75;

// Shared header inner height (excluding safe area insets and border)
// Used by both agent header (ScreenHeader) and explorer sidebar header
// This ensures both headers have the same visual height
export const HEADER_INNER_HEIGHT = 48;
export const HEADER_INNER_HEIGHT_MOBILE = 56;
export const WORKSPACE_SECONDARY_HEADER_HEIGHT = 36;
export const HEADER_TOP_PADDING_MOBILE = 8;

// Max width for chat content (stream view, input area, new agent form)
export const MAX_CONTENT_WIDTH = 820;

// Desktop app constants for macOS traffic light buttons
// These buttons (close/minimize/maximize) overlay the top-left corner
export const DESKTOP_TRAFFIC_LIGHT_WIDTH = 78;
export const DESKTOP_TRAFFIC_LIGHT_HEIGHT = 45;

// Windows/Linux window controls (minimize/maximize/close) — top-right
export const DESKTOP_WINDOW_CONTROLS_WIDTH = 140;
export const DESKTOP_WINDOW_CONTROLS_HEIGHT = 48;

// Check if running in desktop app (any OS)
function isDesktopEnvironment(): boolean {
  if (Platform.OS !== "web") return false;
  return isDesktop();
}

// Check if running in desktop host on macOS
function isDesktopEnvironmentMac(): boolean {
  if (Platform.OS !== "web") return false;
  return isDesktopMac();
}

// Cached result - only cache true, keep checking if false (in case desktop globals load later)
let _isDesktopMacCached: boolean | null = null;
let _isDesktopCached: boolean | null = null;

export function getIsDesktopMac(): boolean {
  if (_isDesktopMacCached === true) {
    return true;
  }
  const result = isDesktopEnvironmentMac();
  if (result) {
    _isDesktopMacCached = true;
  }
  return result;
}

export function getIsDesktop(): boolean {
  if (_isDesktopCached === true) {
    return true;
  }
  const result = isDesktopEnvironment();
  if (result) {
    _isDesktopCached = true;
  }
  return result;
}
