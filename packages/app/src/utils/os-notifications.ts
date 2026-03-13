import { Platform } from "react-native";
import { sendDesktopNotification } from "@/desktop/notifications/desktop-notifications";
import { buildNotificationRoute } from "./notification-routing";
import { getTauri, type TauriNotificationApi } from "@/utils/tauri";

type OsNotificationPayload = {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
};

export type WebNotificationClickDetail = {
  data?: Record<string, unknown>;
};

type WebNotificationInstance = {
  onclick?: ((event: Event) => void) | null;
  onclose?: ((event: Event) => void) | null;
  addEventListener?: (type: string, listener: (event: Event) => void) => void;
  removeEventListener?: (type: string, listener: (event: Event) => void) => void;
  close?: () => void;
};

export const WEB_NOTIFICATION_CLICK_EVENT = "paseo:web-notification-click";

let permissionRequest: Promise<boolean> | null = null;
const activeWebNotifications = new Set<WebNotificationInstance>();

function getTauriNotificationModule(): TauriNotificationApi | null {
  if (Platform.OS !== "web") {
    return null;
  }
  return getTauri()?.notification ?? null;
}

function getWebNotificationConstructor(): {
  permission: string;
  requestPermission?: () => Promise<string>;
  new (title: string, options?: { body?: string; data?: Record<string, unknown> }): unknown;
} | null {
  const NotificationConstructor = (globalThis as { Notification?: any }).Notification;
  return NotificationConstructor ?? null;
}

async function ensureNotificationPermission(): Promise<boolean> {
  const NotificationConstructor = getWebNotificationConstructor();
  if (!NotificationConstructor) {
    return false;
  }
  if (NotificationConstructor.permission === "granted") {
    return true;
  }
  if (NotificationConstructor.permission === "denied") {
    return false;
  }
  if (permissionRequest) {
    return permissionRequest;
  }
  permissionRequest = Promise.resolve(
    NotificationConstructor.requestPermission
      ? NotificationConstructor.requestPermission()
      : "denied"
  ).then((permission) => permission === "granted");
  const result = await permissionRequest;
  permissionRequest = null;
  return result;
}

export async function ensureOsNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== "web") {
    return false;
  }

  const tauriNotification = getTauriNotificationModule();
  if (tauriNotification) {
    return await ensureTauriNotificationPermission(tauriNotification);
  }

  return await ensureNotificationPermission();
}

async function ensureTauriNotificationPermission(
  notificationModule: TauriNotificationApi
): Promise<boolean> {
  if (typeof notificationModule.isPermissionGranted === "function") {
    try {
      const granted = await notificationModule.isPermissionGranted();
      if (granted) {
        console.log("[OSNotifications][Tauri] Permission already granted");
        return true;
      }
    } catch (error) {
      console.warn(
        "[OSNotifications][Tauri] Failed to check notification permission",
        error
      );
    }
  }

  if (typeof notificationModule.requestPermission !== "function") {
    console.warn(
      "[OSNotifications][Tauri] notification.requestPermission is unavailable"
    );
    return false;
  }

  try {
    const result = await notificationModule.requestPermission();
    console.log("[OSNotifications][Tauri] requestPermission result:", result);
    return result === "granted";
  } catch (error) {
    console.warn(
      "[OSNotifications][Tauri] Failed to request notification permission",
      error
    );
    return false;
  }
}

function dispatchWebNotificationClick(detail: WebNotificationClickDetail): boolean {
  const dispatch = (globalThis as { dispatchEvent?: (event: Event) => boolean }).dispatchEvent;
  const CustomEventConstructor = (globalThis as { CustomEvent?: typeof CustomEvent })
    .CustomEvent;

  if (typeof dispatch !== "function" || !CustomEventConstructor) {
    return false;
  }

  const event = new CustomEventConstructor<WebNotificationClickDetail>(
    WEB_NOTIFICATION_CLICK_EVENT,
    {
      detail,
      cancelable: true,
    }
  );
  return dispatch(event) === false;
}

function fallbackNavigateToNotificationTarget(
  data: Record<string, unknown> | undefined
): void {
  const route = buildNotificationRoute(data);
  const location = (globalThis as { location?: { assign?: (url: string) => void; href?: string } })
    .location;
  if (!location) {
    return;
  }
  if (typeof location.assign === "function") {
    location.assign(route);
    return;
  }
  if (typeof location.href === "string") {
    location.href = route;
  }
}

function attachWebClickHandler(
  notification: WebNotificationInstance,
  data: Record<string, unknown> | undefined
): void {
  activeWebNotifications.add(notification);

  const cleanup = () => {
    activeWebNotifications.delete(notification);
  };

  const onClick = () => {
    const focus = (globalThis as { focus?: () => void }).focus;
    if (typeof focus === "function") {
      focus();
    }

    const handledByApp = dispatchWebNotificationClick({ data });
    if (!handledByApp) {
      fallbackNavigateToNotificationTarget(data);
    }

    cleanup();
    if (typeof notification.close === "function") {
      notification.close();
    }
  };

  const onClose = () => {
    cleanup();
  };

  if (typeof notification.addEventListener === "function") {
    notification.addEventListener("click", onClick);
    notification.addEventListener("close", onClose);
    return;
  }

  notification.onclick = onClick;
  notification.onclose = onClose;
}

export async function sendOsNotification(
  payload: OsNotificationPayload
): Promise<boolean> {
  // Mobile/native notifications should be remote push only.
  if (Platform.OS !== "web") {
    return false;
  }

  if (getTauri()) {
    return await sendDesktopNotification(payload);
  }

  const NotificationConstructor = getWebNotificationConstructor();
  if (NotificationConstructor) {
    const granted = await ensureNotificationPermission();
    if (!granted) {
      console.log(
        "[OSNotifications][Web] Permission not granted:",
        NotificationConstructor.permission
      );
    } else {
      const notification = new NotificationConstructor(payload.title, {
        body: payload.body,
        data: payload.data,
      }) as WebNotificationInstance;
      attachWebClickHandler(notification, payload.data);
      return true;
    }
  }

  return false;
}
