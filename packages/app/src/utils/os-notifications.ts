import { Platform } from "react-native";
import { buildNotificationRoute } from "./notification-routing";

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
  addEventListener?: (type: string, listener: (event: Event) => void) => void;
  close?: () => void;
};

export const WEB_NOTIFICATION_CLICK_EVENT = "paseo:web-notification-click";

let permissionRequest: Promise<boolean> | null = null;

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
  const onClick = () => {
    const focus = (globalThis as { focus?: () => void }).focus;
    if (typeof focus === "function") {
      focus();
    }

    const handledByApp = dispatchWebNotificationClick({ data });
    if (!handledByApp) {
      fallbackNavigateToNotificationTarget(data);
    }

    if (typeof notification.close === "function") {
      notification.close();
    }
  };

  if (typeof notification.addEventListener === "function") {
    notification.addEventListener("click", onClick);
    return;
  }

  notification.onclick = onClick;
}

export async function sendOsNotification(
  payload: OsNotificationPayload
): Promise<boolean> {
  // Mobile/native notifications should be remote push only.
  if (Platform.OS !== "web") {
    return false;
  }

  const NotificationConstructor = getWebNotificationConstructor();
  if (!NotificationConstructor) {
    return false;
  }
  const granted = await ensureNotificationPermission();
  if (!granted) {
    return false;
  }
  const notification = new NotificationConstructor(payload.title, {
    body: payload.body,
    data: payload.data,
  }) as WebNotificationInstance;
  attachWebClickHandler(notification, payload.data);
  return true;
}
