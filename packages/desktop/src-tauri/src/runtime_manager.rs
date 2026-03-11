use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use futures_util::{SinkExt, StreamExt};
use http::Request;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

const LOCAL_TRANSPORT_EVENT_NAME: &str = "local-daemon-transport-event";
const UNIX_CLIENT_URL: &str = "ws://localhost/ws";
#[cfg(windows)]
const PIPE_CLIENT_URL: &str = "ws://localhost/ws";
const CLI_SHIM_NAME: &str = "paseo";
#[cfg(windows)]
const CLI_SHIM_WINDOWS_NAME: &str = "paseo.cmd";
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedRuntimeManifest {
    pub runtime_id: String,
    pub runtime_version: String,
    pub platform: String,
    pub arch: String,
    pub created_at: String,
    pub node_relative_path: String,
    pub cli_entrypoint_relative_path: String,
    pub cli_shim_relative_path: String,
    pub server_runner_relative_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundledRuntimePointer {
    runtime_id: String,
    runtime_version: String,
    relative_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedTcpSettings {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedRuntimeStatus {
    pub runtime_id: String,
    pub runtime_version: String,
    pub runtime_root: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CliDaemonStatus {
    server_id: Option<String>,
    status: String,
    listen: String,
    hostname: Option<String>,
    pid: Option<i64>,
    home: String,
    log_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedDaemonStatus {
    pub runtime_id: String,
    pub runtime_version: String,
    pub server_id: String,
    pub status: String,
    pub listen: String,
    pub hostname: Option<String>,
    pub pid: Option<i64>,
    pub home: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliShimStatus {
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedDaemonLogs {
    pub log_path: String,
    pub contents: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedPairingOffer {
    pub relay_enabled: bool,
    pub url: Option<String>,
    pub qr: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliShimResult {
    pub status: String,
    pub installed: bool,
    pub path: Option<String>,
    pub message: String,
    pub manual_instructions: Option<CliManualInstructions>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliManualInstructions {
    pub title: String,
    pub detail: String,
    pub commands: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalTransportEvent {
    session_id: String,
    kind: String,
    text: Option<String>,
    binary_base64: Option<String>,
    code: Option<u16>,
    reason: Option<String>,
    error: Option<String>,
}

struct LocalTransportSession {
    sender: mpsc::UnboundedSender<Message>,
}

pub struct LocalTransportState {
    next_session_id: AtomicU64,
    sessions: Arc<Mutex<HashMap<String, LocalTransportSession>>>,
}

impl Default for LocalTransportState {
    fn default() -> Self {
        Self {
            next_session_id: AtomicU64::new(1),
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl LocalTransportState {
    fn alloc_session_id(&self) -> String {
        format!(
            "local-session-{}",
            self.next_session_id.fetch_add(1, Ordering::Relaxed)
        )
    }
}

#[cfg(unix)]
fn build_local_websocket_request(
    url: &str,
) -> Result<Request<()>, tokio_tungstenite::tungstenite::Error> {
    url.into_client_request()
}

#[cfg(windows)]
fn build_local_websocket_request(
    url: &str,
) -> Result<Request<()>, tokio_tungstenite::tungstenite::Error> {
    url.into_client_request()
}

#[cfg(all(test, unix))]
fn local_client_url() -> &'static str {
    UNIX_CLIENT_URL
}

#[cfg(all(test, windows))]
fn local_client_url() -> &'static str {
    PIPE_CLIENT_URL
}

#[cfg(unix)]
async fn connect_local_socket(
    socket_path: PathBuf,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio::net::UnixStream>,
    tokio_tungstenite::tungstenite::Error,
> {
    let stream = tokio::net::UnixStream::connect(socket_path)
        .await
        .map_err(tokio_tungstenite::tungstenite::Error::Io)?;
    let request = build_local_websocket_request(UNIX_CLIENT_URL)?;
    let (ws_stream, _) = tokio_tungstenite::client_async(request, stream).await?;
    Ok(ws_stream)
}

#[cfg(windows)]
async fn connect_local_pipe(
    pipe_path: String,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio::net::windows::named_pipe::NamedPipeClient>,
    tokio_tungstenite::tungstenite::Error,
> {
    let stream = tokio::net::windows::named_pipe::ClientOptions::new()
        .open(&pipe_path)
        .map_err(tokio_tungstenite::tungstenite::Error::Io)?;
    let request = build_local_websocket_request(PIPE_CLIENT_URL)?;
    let (ws_stream, _) = tokio_tungstenite::client_async(request, stream).await?;
    Ok(ws_stream)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_http_request_lacks_websocket_handshake_headers() {
        let request = Request::builder()
            .uri(local_client_url())
            .header("Host", "localhost")
            .body(())
            .expect("valid manual request");

        assert!(request.headers().get("sec-websocket-key").is_none());
        assert!(request.headers().get("sec-websocket-version").is_none());
        assert!(request.headers().get("upgrade").is_none());
        assert!(request.headers().get("connection").is_none());
    }

    #[test]
    fn generated_local_websocket_request_includes_required_headers() {
        let request = build_local_websocket_request(local_client_url())
            .expect("local websocket request should be generated");

        assert_eq!(request.uri().to_string(), local_client_url());
        assert_eq!(
            request
                .headers()
                .get("host")
                .and_then(|value| value.to_str().ok()),
            Some("localhost")
        );
        assert!(request.headers().contains_key("sec-websocket-key"));
        assert_eq!(
            request
                .headers()
                .get("sec-websocket-version")
                .and_then(|value| value.to_str().ok()),
            Some("13")
        );
        assert_eq!(
            request
                .headers()
                .get("upgrade")
                .and_then(|value| value.to_str().ok()),
            Some("websocket")
        );
        assert_eq!(
            request
                .headers()
                .get("connection")
                .and_then(|value| value.to_str().ok()),
            Some("Upgrade")
        );
    }

    #[test]
    fn cli_shim_result_serializes_manual_instructions_with_camel_case_keys() {
        let value = serde_json::to_value(CliShimResult {
            status: "manualInstallRequired".to_string(),
            installed: false,
            path: Some("/usr/local/bin/paseo".to_string()),
            message: "Manual install required.".to_string(),
            manual_instructions: Some(CliManualInstructions {
                title: "Install from Terminal".to_string(),
                detail: "Run the commands below.".to_string(),
                commands: "sudo ...".to_string(),
            }),
        })
        .expect("serializes");

        assert_eq!(
            value.get("status").and_then(|entry| entry.as_str()),
            Some("manualInstallRequired")
        );
        assert_eq!(
            value
                .get("manualInstructions")
                .and_then(|entry| entry.get("commands"))
                .and_then(|entry| entry.as_str()),
            Some("sudo ...")
        );
    }

    #[test]
    fn cli_shim_contents_runs_bundled_runtime_in_place() {
        let runtime_root =
            PathBuf::from("/Applications/Paseo.app/Contents/Resources/managed-runtime/runtime-1");
        let manifest = ManagedRuntimeManifest {
            runtime_id: "runtime-1".to_string(),
            runtime_version: "0.1.0".to_string(),
            platform: "darwin".to_string(),
            arch: "arm64".to_string(),
            created_at: "2025-01-01T00:00:00.000Z".to_string(),
            node_relative_path: "node/node".to_string(),
            cli_entrypoint_relative_path: "node_modules/@getpaseo/cli/dist/index.js".to_string(),
            cli_shim_relative_path: "node_modules/@getpaseo/cli/bin/paseo".to_string(),
            server_runner_relative_path:
                "node_modules/@getpaseo/server/dist/scripts/daemon-runner.js".to_string(),
        };

        let contents = cli_shim_contents(&runtime_root, &manifest);

        assert!(contents.contains("Contents/Resources/managed-runtime/runtime-1/node/node"));
        assert!(contents.contains("node_modules/@getpaseo/cli/dist/index.js"));
        assert!(!contents.contains("PASEO_HOME"));
        assert!(!contents.contains("--paseo-cli-shim"));
    }

    #[cfg(unix)]
    #[test]
    #[ignore = "requires a running local daemon socket"]
    fn connects_to_running_local_daemon_socket() {
        let socket_path = std::env::var("PASEO_LOCAL_SOCKET_SMOKE_PATH")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .or_else(|| dirs::home_dir().map(|home| home.join(".paseo").join("paseo.sock")))
            .expect("socket path should resolve");

        assert!(
            socket_path.exists(),
            "socket path does not exist: {}",
            socket_path.display()
        );

        tauri::async_runtime::block_on(async move {
            let mut ws_stream = connect_local_socket(socket_path.clone())
                .await
                .unwrap_or_else(|error| {
                    panic!(
                        "local socket websocket handshake failed for {}: {error}",
                        socket_path.display()
                    )
                });
            ws_stream.close(None).await.expect("close websocket stream");
        });
    }
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    serde_json::from_str::<T>(&raw)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))
}

fn dev_resource_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources")
}

fn bundled_runtime_root(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(raw_resource_dir) = app.path().resource_dir() {
        let resource_dir = dunce::simplified(&raw_resource_dir).to_path_buf();
        // Tauri's bundle.resources preserves the source directory structure, so
        // "resources/**/*" in tauri.conf.json places files at
        // $RESOURCE/resources/managed-runtime/. Try the nested path first (installed
        // builds), then the flat path for any future config changes.
        for candidate in [
            resource_dir.join("resources").join("managed-runtime"),
            resource_dir.join("managed-runtime"),
        ] {
            if candidate.exists() {
                log::info!("[runtime] found bundled runtime at {}", candidate.display());
                return Ok(candidate);
            }
            log::info!("[runtime] no bundled runtime at {}", candidate.display());
        }
    } else {
        log::info!("[runtime] resource_dir() unavailable, checking dev path");
    }
    let dev = dev_resource_root().join("managed-runtime");
    if dev.exists() {
        log::info!("[runtime] using dev runtime at {}", dev.display());
        return Ok(dev);
    }
    log::error!("[runtime] no managed runtime found");
    Err("Managed runtime resources are not bundled with this desktop build.".to_string())
}

fn load_bundled_runtime_pointer(
    app: &AppHandle,
) -> Result<(PathBuf, BundledRuntimePointer), String> {
    let root = bundled_runtime_root(app)?;
    let pointer_path = root.join("current-runtime.json");
    let pointer = read_json_file::<BundledRuntimePointer>(&pointer_path)?;
    Ok((root, pointer))
}

fn load_runtime_manifest(runtime_root: &Path) -> Result<ManagedRuntimeManifest, String> {
    read_json_file::<ManagedRuntimeManifest>(&runtime_root.join("runtime-manifest.json"))
}

fn tail_log(path: &Path, max_lines: usize) -> String {
    let raw = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return String::new(),
    };
    let mut lines = raw.lines().rev().take(max_lines).collect::<Vec<_>>();
    lines.reverse();
    lines.join("\n")
}

fn to_stdio_message(input: Option<&str>) -> String {
    input.unwrap_or_default().trim().to_string()
}

fn cli_command(
    runtime_root: &Path,
    manifest: &ManagedRuntimeManifest,
    args: &[&str],
) -> Result<Command, String> {
    let node = runtime_root.join(&manifest.node_relative_path);
    let cli = runtime_root.join(&manifest.cli_entrypoint_relative_path);
    if !node.exists() {
        log::error!("[cli] bundled Node missing at {}", node.display());
        return Err(format!(
            "Bundled Node runtime is missing at {}",
            node.display()
        ));
    }
    if !cli.exists() {
        log::error!("[cli] bundled CLI missing at {}", cli.display());
        return Err(format!(
            "Bundled CLI entrypoint is missing at {}",
            cli.display()
        ));
    }
    log::info!(
        "[cli] node={} cli={} args={:?}",
        node.display(),
        cli.display(),
        args
    );
    let mut command = Command::new(node);
    command.arg(cli);
    command.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    Ok(command)
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

fn escape_applescript_string(value: &str) -> String {
    value.replace('\\', r"\\").replace('"', "\\\"")
}

#[cfg(windows)]
fn powershell_double_quote(value: &str) -> String {
    value.replace('`', "``").replace('"', "`\"")
}

fn outer_cli_shim_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        return Ok(PathBuf::from("/usr/local/bin").join(CLI_SHIM_NAME));
    }
    #[cfg(all(not(target_os = "macos"), not(windows)))]
    {
        return Ok(PathBuf::from("/usr/local/bin").join(CLI_SHIM_NAME));
    }
    #[cfg(windows)]
    {
        let local_app_data = dirs::data_local_dir().ok_or_else(|| {
            "Failed to resolve LocalAppData for CLI shim instructions.".to_string()
        })?;
        Ok(local_app_data
            .join("Microsoft")
            .join("WinGet")
            .join("Links")
            .join(CLI_SHIM_WINDOWS_NAME))
    }
}

fn cli_shim_contents(runtime_root: &Path, manifest: &ManagedRuntimeManifest) -> String {
    let node = runtime_root.join(&manifest.node_relative_path);
    let cli = runtime_root.join(&manifest.cli_entrypoint_relative_path);
    #[cfg(windows)]
    {
        return format!(
            "@echo off\r\n\"{}\" \"{}\" %*\r\n",
            node.display(),
            cli.display()
        );
    }
    #[cfg(not(windows))]
    {
        format!(
            "#!/bin/sh\nexec \"{}\" \"{}\" \"$@\"\n",
            node.display(),
            cli.display()
        )
    }
}

fn write_cli_launcher(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }
    fs::write(path, contents)
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755))
            .map_err(|error| format!("Failed to chmod {}: {error}", path.display()))?;
    }
    Ok(())
}

fn cli_manual_instructions(
    runtime_root: &Path,
    manifest: &ManagedRuntimeManifest,
) -> Result<CliManualInstructions, String> {
    let outer_shim = outer_cli_shim_path()?;
    let contents = cli_shim_contents(runtime_root, manifest);
    #[cfg(windows)]
    {
        let target_dir = outer_shim
            .parent()
            .ok_or_else(|| "CLI shim target is missing a parent directory.".to_string())?;
        return Ok(CliManualInstructions {
            title: "Install the Paseo CLI from PowerShell".to_string(),
            detail: "If the automatic install does not complete, run these commands in PowerShell to write the PATH shim manually.".to_string(),
            commands: format!(
                "$target = \"{}\"\nNew-Item -ItemType Directory -Force -Path \"{}\" | Out-Null\n$contents = @\"\n{}\"@\nSet-Content -Path $target -Value $contents -Encoding ASCII\n",
                powershell_double_quote(outer_shim.to_string_lossy().as_ref()),
                powershell_double_quote(target_dir.to_string_lossy().as_ref()),
                contents
            ),
        });
    }
    #[cfg(not(windows))]
    {
        Ok(CliManualInstructions {
            title: "Install the Paseo CLI from Terminal".to_string(),
            detail: "If the automatic install does not complete, run these commands in Terminal to write the global PATH shim manually.".to_string(),
            commands: format!(
                "sudo mkdir -p {target_dir}\nprintf '%s\\n' {lines} | sudo tee {target_path} >/dev/null\nsudo chmod 755 {target_path}\n",
                target_dir = shell_single_quote(
                    outer_shim
                        .parent()
                        .ok_or_else(|| "CLI shim target is missing a parent directory.".to_string())?
                        .to_string_lossy()
                        .as_ref()
                ),
                target_path = shell_single_quote(outer_shim.to_string_lossy().as_ref()),
                lines = contents
                    .lines()
                    .map(|line| shell_single_quote(line))
                    .collect::<Vec<_>>()
                    .join(" ")
            ),
        })
    }
}

fn detect_installed_cli_shim_path(
    runtime_root: &Path,
    manifest: &ManagedRuntimeManifest,
) -> Option<String> {
    let outer_shim = outer_cli_shim_path().ok()?;
    let expected = cli_shim_contents(runtime_root, manifest);
    let actual = fs::read_to_string(&outer_shim).ok()?;
    (actual == expected).then(|| outer_shim.to_string_lossy().into_owned())
}

fn ensure_runtime_ready_internal(app: &AppHandle) -> Result<ManagedRuntimeStatus, String> {
    log::info!("[runtime] ensuring runtime is ready");
    let (bundled_root, pointer) = load_bundled_runtime_pointer(app)?;
    let runtime_root = bundled_root.join(&pointer.relative_root);
    let manifest = load_runtime_manifest(&runtime_root)?;
    log::info!(
        "[runtime] manifest: id={} version={}",
        manifest.runtime_id,
        manifest.runtime_version
    );

    Ok(ManagedRuntimeStatus {
        runtime_id: manifest.runtime_id,
        runtime_version: manifest.runtime_version,
        runtime_root: runtime_root.to_string_lossy().into_owned(),
    })
}

fn run_cli_json_command(
    runtime_root: &Path,
    manifest: &ManagedRuntimeManifest,
    args: &[&str],
) -> Result<serde_json::Value, String> {
    log::info!("[cli] running: {:?}", args);
    let output = cli_command(runtime_root, manifest, args)?
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| {
            log::error!("[cli] failed to spawn: {error}");
            format!("Failed to run bundled CLI: {error}")
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!(
            "[cli] exit={} stderr={}",
            output.status.code().unwrap_or(-1),
            stderr.trim()
        );
        return Err(format!(
            "Bundled CLI failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    log::info!("[cli] success, parsing JSON output");
    serde_json::from_str(stdout.trim()).map_err(|error| {
        log::error!("[cli] JSON parse error: {error}; stdout={}", stdout.trim());
        format!(
            "Failed to parse bundled CLI JSON output: {error}; stdout={}",
            stdout.trim()
        )
    })
}

fn managed_daemon_status_internal(app: &AppHandle) -> Result<ManagedDaemonStatus, String> {
    let status = ensure_runtime_ready_internal(app)?;
    let runtime_root = PathBuf::from(&status.runtime_root);
    let manifest = load_runtime_manifest(&runtime_root)?;
    let value = run_cli_json_command(&runtime_root, &manifest, &["daemon", "status", "--json"])?;
    let daemon_status: CliDaemonStatus = serde_json::from_value(value)
        .map_err(|error| format!("Failed to parse managed daemon status: {error}"))?;

    Ok(ManagedDaemonStatus {
        runtime_id: manifest.runtime_id,
        runtime_version: manifest.runtime_version,
        server_id: daemon_status.server_id.unwrap_or_default(),
        status: daemon_status.status,
        listen: daemon_status.listen,
        hostname: daemon_status.hostname,
        pid: daemon_status.pid,
        home: daemon_status.home,
    })
}

fn cli_shim_status_internal(app: &AppHandle) -> Result<CliShimStatus, String> {
    let status = ensure_runtime_ready_internal(app)?;
    let runtime_root = PathBuf::from(&status.runtime_root);
    let manifest = load_runtime_manifest(&runtime_root)?;
    Ok(CliShimStatus {
        path: detect_installed_cli_shim_path(&runtime_root, &manifest),
    })
}

#[cfg(target_os = "macos")]
fn install_cli_shim_via_macos_prompt(shim_path: &Path, contents: &str) -> Result<(), String> {
    // Manual smoke path: click Install CLI in the desktop app on macOS and confirm the
    // /usr/local/bin/paseo prompt writes the trivial outer shim shown in cli_manual_instructions().
    let temp_path = std::env::temp_dir().join(format!("paseo-cli-shim-{}", std::process::id()));
    write_cli_launcher(&temp_path, contents)?;
    let command = format!(
        "mkdir -p {target_dir} && install -m 755 {temp_path} {target_path}",
        target_dir = shell_single_quote(
            shim_path
                .parent()
                .ok_or_else(|| "CLI shim target is missing a parent directory.".to_string())?
                .to_string_lossy()
                .as_ref()
        ),
        temp_path = shell_single_quote(temp_path.to_string_lossy().as_ref()),
        target_path = shell_single_quote(shim_path.to_string_lossy().as_ref())
    );
    let output = Command::new("osascript")
        .arg("-e")
        .arg(format!(
            "do shell script \"{}\" with administrator privileges",
            escape_applescript_string(&command)
        ))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Failed to request macOS CLI install privileges: {error}"))?;
    let _ = fs::remove_file(&temp_path);
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.contains("User canceled") || stderr.contains("(-128)") {
        return Err("ELEVATION_DENIED".to_string());
    }
    Err(if stderr.is_empty() {
        "Failed to install the global CLI shim.".to_string()
    } else {
        stderr
    })
}

#[cfg(target_os = "macos")]
fn remove_cli_shim_via_macos_prompt(shim_path: &Path) -> Result<(), String> {
    let command = format!(
        "rm -f {}",
        shell_single_quote(shim_path.to_string_lossy().as_ref())
    );
    let output = Command::new("osascript")
        .arg("-e")
        .arg(format!(
            "do shell script \"{}\" with administrator privileges",
            escape_applescript_string(&command)
        ))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Failed to request macOS CLI uninstall privileges: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        "Failed to remove the global CLI shim.".to_string()
    } else {
        stderr
    })
}

fn install_cli_shim_internal(app: &AppHandle) -> Result<CliShimResult, String> {
    log::info!("[cli-shim] installing CLI shim");
    let status = ensure_runtime_ready_internal(app)?;
    let runtime_root = PathBuf::from(&status.runtime_root);
    let manifest = load_runtime_manifest(&runtime_root)?;
    let shim_path = outer_cli_shim_path()?;
    let shim_contents = cli_shim_contents(&runtime_root, &manifest);
    let manual_instructions = cli_manual_instructions(&runtime_root, &manifest)?;

    #[cfg(target_os = "macos")]
    let install_result = install_cli_shim_via_macos_prompt(&shim_path, &shim_contents);
    #[cfg(all(not(target_os = "macos"), not(windows)))]
    let install_result = write_cli_launcher(&shim_path, &shim_contents);
    #[cfg(windows)]
    let install_result: Result<(), String> = Err("AUTOMATIC_INSTALL_UNAVAILABLE".to_string());

    log::info!("[cli-shim] target path: {}", shim_path.display());
    match install_result {
        Ok(()) => Ok(CliShimResult {
            status: "installed".to_string(),
            installed: true,
            path: Some(shim_path.to_string_lossy().into_owned()),
            message: format!("Paseo CLI installed at {}.", shim_path.display()),
            manual_instructions: None,
        }),
        Err(error) if error == "ELEVATION_DENIED" => Ok(CliShimResult {
            status: "elevationDenied".to_string(),
            installed: false,
            path: Some(shim_path.to_string_lossy().into_owned()),
            message: "CLI install needs administrator approval. If you dismissed the prompt, install it from Terminal with the commands below.".to_string(),
            manual_instructions: Some(manual_instructions),
        }),
        Err(error) if error == "AUTOMATIC_INSTALL_UNAVAILABLE" => Ok(CliShimResult {
            status: "automaticInstallUnavailable".to_string(),
            installed: false,
            path: Some(shim_path.to_string_lossy().into_owned()),
            message: "Automatic CLI install is not available on this platform. Finish the install manually with the commands below.".to_string(),
            manual_instructions: Some(manual_instructions),
        }),
        Err(error) => Ok(CliShimResult {
            status: "manualInstallRequired".to_string(),
            installed: false,
            path: Some(shim_path.to_string_lossy().into_owned()),
            message: format!(
                "Automatic CLI install did not complete: {error}. Finish the install manually with the commands below."
            ),
            manual_instructions: Some(manual_instructions),
        }),
    }
}

fn uninstall_cli_shim_internal(app: &AppHandle) -> Result<CliShimResult, String> {
    let status = ensure_runtime_ready_internal(app)?;
    let runtime_root = PathBuf::from(&status.runtime_root);
    let manifest = load_runtime_manifest(&runtime_root)?;
    let shim_path = detect_installed_cli_shim_path(&runtime_root, &manifest)
        .map(PathBuf::from)
        .unwrap_or(outer_cli_shim_path()?);
    if shim_path.exists() {
        #[cfg(target_os = "macos")]
        remove_cli_shim_via_macos_prompt(&shim_path)?;
        #[cfg(all(not(target_os = "macos"), not(windows)))]
        fs::remove_file(&shim_path)
            .map_err(|error| format!("Failed to remove {}: {error}", shim_path.display()))?;
        #[cfg(windows)]
        fs::remove_file(&shim_path)
            .map_err(|error| format!("Failed to remove {}: {error}", shim_path.display()))?;
    }

    Ok(CliShimResult {
        status: "removed".to_string(),
        installed: false,
        path: Some(shim_path.to_string_lossy().into_owned()),
        message: "Paseo CLI shim removed.".to_string(),
        manual_instructions: None,
    })
}

fn start_managed_daemon_internal(app: &AppHandle) -> Result<ManagedDaemonStatus, String> {
    log::info!("[daemon] starting managed daemon");
    let status = ensure_runtime_ready_internal(app)?;
    let runtime_root = PathBuf::from(&status.runtime_root);
    let manifest = load_runtime_manifest(&runtime_root)?;
    let output = cli_command(&runtime_root, &manifest, &["start"])?
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| {
            log::error!("[daemon] failed to spawn: {error}");
            format!("Failed to launch managed daemon: {error}")
        })?;
    if !output.status.success() {
        let stderr = to_stdio_message(Some(&String::from_utf8_lossy(&output.stderr)));
        log::error!(
            "[daemon] start failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr
        );
        return Err(format!(
            "Managed daemon start failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr
        ));
    }
    log::info!("[daemon] start command succeeded, waiting for daemon to be ready");
    for attempt in 0..150 {
        let daemon_status = managed_daemon_status_internal(app)?;
        if daemon_status.status == "running" && !daemon_status.server_id.trim().is_empty() {
            log::info!(
                "[daemon] ready after {} attempts (pid={:?})",
                attempt + 1,
                daemon_status.pid
            );
            return Ok(daemon_status);
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    log::warn!("[daemon] timed out waiting for daemon to become ready");
    managed_daemon_status_internal(app)
}

fn stop_managed_daemon_internal(app: &AppHandle) -> Result<ManagedDaemonStatus, String> {
    log::info!("[daemon] stopping managed daemon");
    let status = ensure_runtime_ready_internal(app)?;
    let runtime_root = PathBuf::from(&status.runtime_root);
    let manifest = load_runtime_manifest(&runtime_root)?;
    let output = cli_command(&runtime_root, &manifest, &["daemon", "stop", "--json"])?
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| {
            log::error!("[daemon] failed to spawn stop command: {error}");
            format!("Failed to stop managed daemon: {error}")
        })?;
    if !output.status.success() {
        let stderr = to_stdio_message(Some(&String::from_utf8_lossy(&output.stderr)));
        log::error!(
            "[daemon] stop failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr
        );
        return Err(format!(
            "Managed daemon stop failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr
        ));
    }
    log::info!("[daemon] stop command succeeded");
    managed_daemon_status_internal(app)
}

fn restart_managed_daemon_internal(app: &AppHandle) -> Result<ManagedDaemonStatus, String> {
    log::info!("[daemon] restarting managed daemon");
    let status = ensure_runtime_ready_internal(app)?;
    let runtime_root = PathBuf::from(&status.runtime_root);
    let manifest = load_runtime_manifest(&runtime_root)?;
    let output = cli_command(&runtime_root, &manifest, &["daemon", "restart", "--json"])?
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| {
            log::error!("[daemon] failed to spawn restart command: {error}");
            format!("Failed to restart managed daemon: {error}")
        })?;
    if !output.status.success() {
        let stderr = to_stdio_message(Some(&String::from_utf8_lossy(&output.stderr)));
        log::error!(
            "[daemon] restart failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr
        );
        return Err(format!(
            "Managed daemon restart failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr
        ));
    }
    log::info!("[daemon] restart command succeeded");
    managed_daemon_status_internal(app)
}

fn update_managed_tcp_settings_internal(
    app: &AppHandle,
    _settings: ManagedTcpSettings,
) -> Result<ManagedDaemonStatus, String> {
    let _ = app;
    Err("Managed daemon TCP settings are no longer configurable from desktop.".to_string())
}

#[tauri::command]
pub async fn managed_runtime_status(app: AppHandle) -> Result<ManagedRuntimeStatus, String> {
    tauri::async_runtime::spawn_blocking(move || ensure_runtime_ready_internal(&app))
        .await
        .map_err(|error| format!("Managed runtime status task failed: {error}"))?
}

#[tauri::command]
pub async fn managed_daemon_status(app: AppHandle) -> Result<ManagedDaemonStatus, String> {
    tauri::async_runtime::spawn_blocking(move || managed_daemon_status_internal(&app))
        .await
        .map_err(|error| format!("Managed daemon status task failed: {error}"))?
}

#[tauri::command]
pub async fn start_managed_daemon(app: AppHandle) -> Result<ManagedDaemonStatus, String> {
    tauri::async_runtime::spawn_blocking(move || start_managed_daemon_internal(&app))
        .await
        .map_err(|error| format!("Managed daemon start task failed: {error}"))?
}

#[tauri::command]
pub async fn stop_managed_daemon(app: AppHandle) -> Result<ManagedDaemonStatus, String> {
    tauri::async_runtime::spawn_blocking(move || stop_managed_daemon_internal(&app))
        .await
        .map_err(|error| format!("Managed daemon stop task failed: {error}"))?
}

#[tauri::command]
pub async fn restart_managed_daemon(app: AppHandle) -> Result<ManagedDaemonStatus, String> {
    tauri::async_runtime::spawn_blocking(move || restart_managed_daemon_internal(&app))
        .await
        .map_err(|error| format!("Managed daemon restart task failed: {error}"))?
}

#[tauri::command]
pub async fn cli_shim_status(app: AppHandle) -> Result<CliShimStatus, String> {
    tauri::async_runtime::spawn_blocking(move || cli_shim_status_internal(&app))
        .await
        .map_err(|error| format!("CLI shim status task failed: {error}"))?
}

#[tauri::command]
pub async fn managed_daemon_logs(app: AppHandle) -> Result<ManagedDaemonLogs, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let runtime_status = ensure_runtime_ready_internal(&app)?;
        let runtime_root = PathBuf::from(&runtime_status.runtime_root);
        let manifest = load_runtime_manifest(&runtime_root)?;
        let value =
            run_cli_json_command(&runtime_root, &manifest, &["daemon", "status", "--json"])?;
        let daemon_status: CliDaemonStatus = serde_json::from_value(value)
            .map_err(|error| format!("Failed to parse managed daemon status for logs: {error}"))?;
        let log_path = PathBuf::from(&daemon_status.log_path);
        Ok(ManagedDaemonLogs {
            log_path: log_path.to_string_lossy().into_owned(),
            contents: tail_log(&log_path, 400),
        })
    })
    .await
    .map_err(|error| format!("Managed daemon logs task failed: {error}"))?
}

#[tauri::command]
pub async fn managed_daemon_pairing(app: AppHandle) -> Result<ManagedPairingOffer, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let status = ensure_runtime_ready_internal(&app)?;
        let runtime_root = PathBuf::from(&status.runtime_root);
        let manifest = load_runtime_manifest(&runtime_root)?;
        let value = run_cli_json_command(&runtime_root, &manifest, &["daemon", "pair", "--json"])?;
        serde_json::from_value::<ManagedPairingOffer>(value)
            .map_err(|error| format!("Failed to parse managed pairing offer: {error}"))
    })
    .await
    .map_err(|error| format!("Managed daemon pairing task failed: {error}"))?
}

#[tauri::command]
pub async fn install_cli_shim(app: AppHandle) -> Result<CliShimResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_cli_shim_internal(&app))
        .await
        .map_err(|error| format!("CLI shim install task failed: {error}"))?
}

#[tauri::command]
pub async fn uninstall_cli_shim(app: AppHandle) -> Result<CliShimResult, String> {
    tauri::async_runtime::spawn_blocking(move || uninstall_cli_shim_internal(&app))
        .await
        .map_err(|error| format!("CLI shim uninstall task failed: {error}"))?
}

#[tauri::command]
pub async fn update_managed_daemon_tcp_settings(
    app: AppHandle,
    settings: ManagedTcpSettings,
) -> Result<ManagedDaemonStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        update_managed_tcp_settings_internal(&app, settings)
    })
    .await
    .map_err(|error| format!("Managed daemon TCP settings task failed: {error}"))?
}

async fn spawn_local_transport_session<S>(
    app: AppHandle,
    transport_state: State<'_, LocalTransportState>,
    session_id: String,
    ws_stream: tokio_tungstenite::WebSocketStream<S>,
) -> Result<String, String>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (mut write, mut read) = ws_stream.split();
    let (sender, mut receiver) = mpsc::unbounded_channel::<Message>();
    transport_state
        .sessions
        .lock()
        .map_err(|_| "Local transport session lock poisoned.".to_string())?
        .insert(session_id.clone(), LocalTransportSession { sender });

    let app_for_read = app.clone();
    let app_for_write = app.clone();
    let sessions_for_read = Arc::clone(&transport_state.sessions);
    let read_session_id = session_id.clone();
    tauri::async_runtime::spawn(async move {
        let _ = app_for_read.emit(
            LOCAL_TRANSPORT_EVENT_NAME,
            LocalTransportEvent {
                session_id: read_session_id.clone(),
                kind: "open".to_string(),
                text: None,
                binary_base64: None,
                code: None,
                reason: None,
                error: None,
            },
        );

        while let Some(message) = read.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    let _ = app_for_read.emit(
                        LOCAL_TRANSPORT_EVENT_NAME,
                        LocalTransportEvent {
                            session_id: read_session_id.clone(),
                            kind: "message".to_string(),
                            text: Some(text.to_string()),
                            binary_base64: None,
                            code: None,
                            reason: None,
                            error: None,
                        },
                    );
                }
                Ok(Message::Binary(bytes)) => {
                    let _ = app_for_read.emit(
                        LOCAL_TRANSPORT_EVENT_NAME,
                        LocalTransportEvent {
                            session_id: read_session_id.clone(),
                            kind: "message".to_string(),
                            text: None,
                            binary_base64: Some(BASE64_STANDARD.encode(bytes)),
                            code: None,
                            reason: None,
                            error: None,
                        },
                    );
                }
                Ok(Message::Close(frame)) => {
                    let _ = app_for_read.emit(
                        LOCAL_TRANSPORT_EVENT_NAME,
                        LocalTransportEvent {
                            session_id: read_session_id.clone(),
                            kind: "close".to_string(),
                            text: None,
                            binary_base64: None,
                            code: frame.as_ref().map(|value| value.code.into()),
                            reason: frame.as_ref().map(|value| value.reason.to_string()),
                            error: None,
                        },
                    );
                    break;
                }
                Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => {}
                Ok(Message::Frame(_)) => {}
                Err(error) => {
                    let _ = app_for_read.emit(
                        LOCAL_TRANSPORT_EVENT_NAME,
                        LocalTransportEvent {
                            session_id: read_session_id.clone(),
                            kind: "error".to_string(),
                            text: None,
                            binary_base64: None,
                            code: None,
                            reason: None,
                            error: Some(error.to_string()),
                        },
                    );
                    break;
                }
            }
        }

        if let Ok(mut sessions) = sessions_for_read.lock() {
            sessions.remove(&read_session_id);
        }
    });

    let sessions_for_write = Arc::clone(&transport_state.sessions);
    let write_session_id = session_id.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(message) = receiver.recv().await {
            if write.send(message).await.is_err() {
                let _ = app_for_write.emit(
                    LOCAL_TRANSPORT_EVENT_NAME,
                    LocalTransportEvent {
                        session_id: write_session_id.clone(),
                        kind: "error".to_string(),
                        text: None,
                        binary_base64: None,
                        code: None,
                        reason: None,
                        error: Some("Local transport write failed.".to_string()),
                    },
                );
                break;
            }
        }
        if let Ok(mut sessions) = sessions_for_write.lock() {
            sessions.remove(&write_session_id);
        }
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn open_local_daemon_transport(
    app: AppHandle,
    transport_state: State<'_, LocalTransportState>,
    transport_type: String,
    transport_path: String,
) -> Result<String, String> {
    let session_id = transport_state.alloc_session_id();
    log::info!(
        "[transport] opening session {} type={} path={}",
        session_id,
        transport_type,
        transport_path
    );
    let _ = app;
    match transport_type.as_str() {
        "pipe" => {
            #[cfg(windows)]
            {
                let ws_stream = connect_local_pipe(transport_path)
                    .await
                    .map_err(|error| format!("Failed to connect to local daemon pipe: {error}"))?;
                spawn_local_transport_session(app, transport_state, session_id, ws_stream).await
            }
            #[cfg(not(windows))]
            {
                Err(tokio_tungstenite::tungstenite::Error::Io(io::Error::new(
                    io::ErrorKind::Unsupported,
                    "Local pipe transport is only available on Windows.",
                ))
                .to_string())
            }
        }
        "socket" => {
            #[cfg(unix)]
            {
                let ws_stream = connect_local_socket(PathBuf::from(transport_path))
                    .await
                    .map_err(|error| {
                        format!("Failed to connect to local daemon socket: {error}")
                    })?;
                spawn_local_transport_session(app, transport_state, session_id, ws_stream).await
            }
            #[cfg(not(unix))]
            {
                Err(tokio_tungstenite::tungstenite::Error::Io(io::Error::new(
                    io::ErrorKind::Unsupported,
                    "Local socket transport is only available on Unix platforms.",
                ))
                .to_string())
            }
        }
        other => Err(format!("Unsupported local transport type: {other}")),
    }
}

#[tauri::command]
pub async fn send_local_daemon_transport_message(
    transport_state: State<'_, LocalTransportState>,
    session_id: String,
    text: Option<String>,
    binary_base64: Option<String>,
) -> Result<(), String> {
    let sessions = transport_state
        .sessions
        .lock()
        .map_err(|_| "Local transport session lock poisoned.".to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Local transport session not found: {session_id}"))?;
    if let Some(text) = text {
        session
            .sender
            .send(Message::Text(text.into()))
            .map_err(|_| "Local transport session is closed.".to_string())?;
        return Ok(());
    }
    if let Some(binary_base64) = binary_base64 {
        let bytes = BASE64_STANDARD
            .decode(binary_base64.as_bytes())
            .map_err(|error| format!("Failed to decode local transport payload: {error}"))?;
        session
            .sender
            .send(Message::Binary(bytes.into()))
            .map_err(|_| "Local transport session is closed.".to_string())?;
        return Ok(());
    }
    Err("Local transport send requires text or binary payload.".to_string())
}

#[tauri::command]
pub async fn close_local_daemon_transport(
    transport_state: State<'_, LocalTransportState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = transport_state
        .sessions
        .lock()
        .map_err(|_| "Local transport session lock poisoned.".to_string())?;
    let session = sessions
        .remove(&session_id)
        .ok_or_else(|| format!("Local transport session not found: {session_id}"))?;
    session
        .sender
        .send(Message::Close(None))
        .map_err(|_| "Local transport session is already closed.".to_string())?;
    Ok(())
}
