fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=macos/paseo_notifications.h");
        println!("cargo:rerun-if-changed=macos/paseo_notifications.m");

        cc::Build::new()
            .file("macos/paseo_notifications.m")
            .flag("-fobjc-arc")
            .compile("paseo_notifications");

        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
    }

    tauri_build::build()
}
