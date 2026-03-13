import { invokeDesktopCommand } from "@/desktop/tauri/invoke-desktop-command";
import { getTauri } from "@/utils/tauri";

export const DESKTOP_NOTIFICATION_CLICK_EVENT = "desktop-notification-click";

export interface DesktopNotificationInput {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export interface DesktopNotificationClickPayload {
  data?: Record<string, unknown>;
}

export type DesktopNotificationClickHandler = (
  payload: DesktopNotificationClickPayload
) => void;

export type DesktopNotificationClickUnlisten = () => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function sendDesktopNotification(
  input: DesktopNotificationInput
): Promise<boolean> {
  try {
    await invokeDesktopCommand("send_desktop_notification", { input });
    return true;
  } catch (error) {
    console.warn("[OSNotifications][Desktop] Failed to send desktop notification", error);
    return false;
  }
}

export async function listenToDesktopNotificationClicks(
  handler: DesktopNotificationClickHandler
): Promise<DesktopNotificationClickUnlisten> {
  const listen = getTauri()?.event?.listen;
  if (typeof listen !== "function") {
    throw new Error("Tauri event API is unavailable.");
  }

  const unlisten = await listen(DESKTOP_NOTIFICATION_CLICK_EVENT, (event: unknown) => {
    const payload = isRecord(event) && isRecord(event.payload) ? event.payload : null;
    if (!payload) {
      return;
    }

    handler({
      data: isRecord(payload.data) ? payload.data : undefined,
    });
  });

  return typeof unlisten === "function" ? unlisten : () => {};
}
