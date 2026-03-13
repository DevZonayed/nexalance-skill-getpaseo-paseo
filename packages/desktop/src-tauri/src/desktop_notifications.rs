use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Runtime};

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
        DESKTOP_NOTIFICATION_CLICK_EVENT,
    };
    use std::sync::OnceLock;
    use tauri::{async_runtime, Emitter, Runtime};

    const MACOS_NOTIFICATION_SENDER_BUNDLE_ID: &str = "dev.paseo.desktop";
    static MACOS_NOTIFICATION_SENDER_INIT: OnceLock<Result<(), String>> = OnceLock::new();

    fn ensure_notification_sender() -> Result<(), String> {
        MACOS_NOTIFICATION_SENDER_INIT
            .get_or_init(|| {
                mac_notification_sys::set_application(MACOS_NOTIFICATION_SENDER_BUNDLE_ID)
                    .map_err(|error| {
                        format!(
                            "Failed to initialize macOS notification sender for {}: {error}",
                            MACOS_NOTIFICATION_SENDER_BUNDLE_ID
                        )
                    })
            })
            .clone()
    }

    pub fn send_notification<R: Runtime>(
        app: AppHandle<R>,
        input: DesktopNotificationInput,
    ) -> Result<(), String> {
        let _task = async_runtime::spawn_blocking(move || {
            if let Err(error) = ensure_notification_sender() {
                log::warn!("{error}");
                return;
            }

            let mut notification = mac_notification_sys::Notification::default();
            notification
                .title(&input.title)
                .message(input.body.as_deref().unwrap_or(""))
                .wait_for_click(true);

            match notification.send() {
                Ok(mac_notification_sys::NotificationResponse::Click) => {
                    let payload = DesktopNotificationClickPayload { data: input.data };
                    if let Err(error) = app.emit(DESKTOP_NOTIFICATION_CLICK_EVENT, payload) {
                        log::warn!("failed to emit desktop notification click event: {error}");
                    }
                }
                Ok(_) => {}
                Err(error) => {
                    log::warn!("failed to send macOS notification: {error}");
                }
            }
        });

        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::{AppHandle, DesktopNotificationInput};
    use tauri::Runtime;
    use tauri_plugin_notification::NotificationExt;

    pub fn send_notification<R: Runtime>(
        app: AppHandle<R>,
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
pub async fn send_desktop_notification<R: Runtime>(
    app: AppHandle<R>,
    input: DesktopNotificationInput,
) -> Result<(), String> {
    platform::send_notification(app, input)
}
