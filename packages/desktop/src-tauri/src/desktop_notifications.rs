use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Wry};

pub const DESKTOP_NOTIFICATION_CLICK_EVENT: &str = "desktop-notification-click";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopNotificationInput {
    pub title: String,
    pub body: Option<String>,
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopNotificationClickPayload {
    data: Option<Value>,
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{
        AppHandle, DesktopNotificationClickPayload, DesktopNotificationInput,
        DESKTOP_NOTIFICATION_CLICK_EVENT, Value, Wry,
    };
    use std::ffi::{CStr, CString};
    use std::os::raw::c_char;
    use std::sync::{Mutex, OnceLock};
    use tauri::Emitter;

    #[link(name = "paseo_notifications", kind = "static")]
    unsafe extern "C" {
        fn paseo_notifications_initialize(
            callback: extern "C" fn(*const c_char),
            error_out: *mut *mut c_char,
        ) -> bool;
        fn paseo_notifications_send(
            title: *const c_char,
            body: *const c_char,
            payload_json: *const c_char,
            error_out: *mut *mut c_char,
        ) -> bool;
        fn paseo_notifications_free_string(value: *mut c_char);
    }

    static MACOS_NOTIFICATION_APP: OnceLock<Mutex<Option<AppHandle<Wry>>>> = OnceLock::new();
    static MACOS_NOTIFICATION_INIT: OnceLock<Result<(), String>> = OnceLock::new();

    fn app_slot() -> &'static Mutex<Option<AppHandle<Wry>>> {
        MACOS_NOTIFICATION_APP.get_or_init(|| Mutex::new(None))
    }

    fn read_owned_error_message(error_ptr: *mut c_char) -> String {
        if error_ptr.is_null() {
            return "Unknown macOS notification error".to_string();
        }

        let message = unsafe { CStr::from_ptr(error_ptr) }
            .to_string_lossy()
            .into_owned();
        unsafe {
            paseo_notifications_free_string(error_ptr);
        }
        message
    }

    extern "C" fn handle_notification_click(payload_json: *const c_char) {
        let data = if payload_json.is_null() {
            None
        } else {
            let raw = unsafe { CStr::from_ptr(payload_json) }.to_string_lossy();
            serde_json::from_str::<Value>(&raw).ok()
        };

        let payload = DesktopNotificationClickPayload { data };
        let Ok(guard) = app_slot().lock() else {
            return;
        };
        let Some(app) = guard.clone() else {
            return;
        };
        if let Err(error) = app.emit(DESKTOP_NOTIFICATION_CLICK_EVENT, payload) {
            log::warn!("failed to emit desktop notification click event: {error}");
        }
    }

    fn ensure_notification_bridge() -> Result<(), String> {
        MACOS_NOTIFICATION_INIT
            .get_or_init(|| {
                let mut error_ptr: *mut c_char = std::ptr::null_mut();
                let ok = unsafe {
                    paseo_notifications_initialize(handle_notification_click, &mut error_ptr)
                };
                if ok {
                    Ok(())
                } else {
                    Err(read_owned_error_message(error_ptr))
                }
            })
            .clone()
    }

    pub fn send_notification(
        app: AppHandle<Wry>,
        input: DesktopNotificationInput,
    ) -> Result<(), String> {
        {
            let mut guard = app_slot()
                .lock()
                .map_err(|_| "Failed to lock macOS notification app handle".to_string())?;
            *guard = Some(app);
        }

        ensure_notification_bridge()?;

        let title = CString::new(input.title)
            .map_err(|_| "Desktop notification title contains interior NUL byte".to_string())?;
        let body = CString::new(input.body.unwrap_or_default())
            .map_err(|_| "Desktop notification body contains interior NUL byte".to_string())?;
        let payload_json = CString::new(
            input
                .data
                .map(|value| value.to_string())
                .unwrap_or_default(),
        )
        .map_err(|_| "Desktop notification payload contains interior NUL byte".to_string())?;

        let mut error_ptr: *mut c_char = std::ptr::null_mut();
        let ok = unsafe {
            paseo_notifications_send(
                title.as_ptr(),
                body.as_ptr(),
                payload_json.as_ptr(),
                &mut error_ptr,
            )
        };
        if ok {
            Ok(())
        } else {
            Err(read_owned_error_message(error_ptr))
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::sync::mpsc;
        use std::time::{Duration, Instant};

        extern "C" fn noop_notification_click(_payload_json: *const c_char) {}

        static CLICK_TEST_SENDER: std::sync::OnceLock<mpsc::Sender<Option<String>>> =
            std::sync::OnceLock::new();

        extern "C" fn capture_notification_click(payload_json: *const c_char) {
            let payload = if payload_json.is_null() {
                None
            } else {
                Some(
                    unsafe { CStr::from_ptr(payload_json) }
                        .to_string_lossy()
                        .into_owned(),
                )
            };

            if let Some(sender) = CLICK_TEST_SENDER.get() {
                let _ = sender.send(payload);
            }
        }

        #[test]
        #[ignore = "requires a running Cocoa app main queue; verify through the desktop app"]
        fn native_notification_send_returns_without_waiting_for_click() {
            let mut error_ptr: *mut c_char = std::ptr::null_mut();
            let initialized = unsafe {
                paseo_notifications_initialize(noop_notification_click, &mut error_ptr)
            };
            assert!(
                initialized,
                "bridge initialization failed: {}",
                read_owned_error_message(error_ptr)
            );

            let title = CString::new("Paseo notification smoke test").expect("valid title");
            let started_at = Instant::now();
            let sent = unsafe {
                paseo_notifications_send(
                    title.as_ptr(),
                    std::ptr::null(),
                    std::ptr::null(),
                    &mut error_ptr,
                )
            };
            assert!(
                sent,
                "native send failed: {}",
                read_owned_error_message(error_ptr)
            );
            assert!(
                started_at.elapsed() < Duration::from_secs(2),
                "native send unexpectedly blocked for {:?}",
                started_at.elapsed()
            );
        }

        #[test]
        #[ignore = "manual smoke test; click the macOS notification within 60 seconds"]
        fn native_notification_click_callback_roundtrip() {
            let (tx, rx) = mpsc::channel();
            let _ = CLICK_TEST_SENDER.set(tx);

            let mut error_ptr: *mut c_char = std::ptr::null_mut();
            let initialized = unsafe {
                paseo_notifications_initialize(capture_notification_click, &mut error_ptr)
            };
            assert!(
                initialized,
                "bridge initialization failed: {}",
                read_owned_error_message(error_ptr)
            );

            let title = CString::new("Paseo manual click test").expect("valid title");
            let body = CString::new("Click this notification to verify the callback path.")
                .expect("valid body");
            let payload_json =
                CString::new(r#"{"kind":"manual-smoke","source":"codex"}"#).expect("valid payload");

            let sent = unsafe {
                paseo_notifications_send(
                    title.as_ptr(),
                    body.as_ptr(),
                    payload_json.as_ptr(),
                    &mut error_ptr,
                )
            };
            assert!(
                sent,
                "native send failed: {}",
                read_owned_error_message(error_ptr)
            );

            eprintln!("Notification sent. Click it within 60 seconds.");
            let payload = rx
                .recv_timeout(Duration::from_secs(60))
                .expect("timed out waiting for notification click");
            assert_eq!(payload.as_deref(), Some(r#"{"kind":"manual-smoke","source":"codex"}"#));
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::{AppHandle, DesktopNotificationInput, Wry};
    use tauri_plugin_notification::NotificationExt;

    pub fn send_notification(
        app: AppHandle<Wry>,
        input: DesktopNotificationInput,
    ) -> Result<(), String> {
        let mut notification = app.notification().builder().title(&input.title);
        if let Some(body) = &input.body {
            notification = notification.body(body);
        }

        notification
            .show()
            .map_err(|error| format!("Failed to send desktop notification: {error}"))?;

        Ok(())
    }
}

#[tauri::command]
pub async fn send_desktop_notification(
    app: AppHandle<Wry>,
    input: DesktopNotificationInput,
) -> Result<(), String> {
    platform::send_notification(app, input)
}
