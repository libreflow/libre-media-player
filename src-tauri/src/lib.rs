use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
#[cfg(windows)]
use tauri_plugin_opener::OpenerExt;

// Must mirror src/utils.ts's VIDEO_EXTENSIONS -- there's no practical way to
// share a single source of truth between the Rust and TS sides for a list
// this small, so keep the two in sync by hand if either changes.
const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "webm", "m4v", "flv", "wmv", "ts", "mpg", "mpeg",
];

fn is_video_path(arg: &str) -> bool {
    let lower = arg.to_lowercase();
    VIDEO_EXTENSIONS
        .iter()
        .any(|ext| lower.ends_with(&format!(".{ext}")))
}

// `args[0]` is always the exe's own path, never the file to open -- skip it.
// The rest are OS-launch argv (double-clicking an associated file passes its
// full path as the sole argument) or single-instance's forwarded argv from a
// second launch attempt; either way, the first argument that looks like a
// video path (not a flag, not something else) is what we want.
fn find_video_arg(args: &[String]) -> Option<String> {
    args.iter().skip(1).find(|a| is_video_path(a)).cloned()
}

struct InitialFile(Mutex<Option<String>>);

// Read (not consumed) by the frontend on startup: the initial OS-launch
// file must stay queryable idempotently, because the webview can be
// recreated (StrictMode double-mount in dev, or a runtime webview reload)
// and re-request it -- `.take()` would have cleared it and silently lost
// the file on that second request.
#[tauri::command]
fn get_initial_file(state: tauri::State<InitialFile>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

// Opens Windows' Default Apps settings page, scoped directly to Libre Media
// Player when possible instead of the generic list the user would
// otherwise have to search through themselves.
//
// The registration name written by windows/hooks.nsh's NSIS_HOOK_POSTINSTALL
// ("Libre Media Player") lives under either HKCU or HKLM
// \Software\RegisteredApplications depending on the NSIS install mode
// (tauri.conf.json doesn't override bundle.windows.nsis.installMode, so the
// default -- per-user, HKCU -- is what a normal install produces; HKLM is
// only checked as a fallback in case a future config change switches to
// perMachine/both). Per Microsoft's ms-settings:defaultapps URI scheme
// (Windows 11 21H2+ with the 2023-04 update or later), passing the matching
// registeredAppUser/registeredAppMachine query param deep-links straight to
// that app's page; an app that isn't registered there at all (e.g. running
// via `tauri dev`, never installed) falls back to the plain
// ms-settings:defaultapps list.
#[cfg(windows)]
const DEFAULT_APPS_REG_NAME: &str = "Libre Media Player";
#[cfg(windows)]
const DEFAULT_APPS_REG_PATH: &str = "Software\\RegisteredApplications";

// Pure, independently-testable URI builder -- separated from the actual
// registry read (is_registered_user/is_registered_machine are plain bools
// the caller determines however it wants) so the branching logic itself
// can be covered by a unit test without needing a real Windows registry.
#[cfg(windows)]
fn default_apps_settings_uri(is_registered_user: bool, is_registered_machine: bool) -> String {
    // DEFAULT_APPS_REG_NAME is a fixed, known constant (only a space, no
    // other character needing escaping) -- a full percent-encoding crate
    // would be overkill for one literal string.
    let encoded_name = DEFAULT_APPS_REG_NAME.replace(' ', "%20");
    if is_registered_user {
        format!("ms-settings:defaultapps?registeredAppUser={encoded_name}")
    } else if is_registered_machine {
        format!("ms-settings:defaultapps?registeredAppMachine={encoded_name}")
    } else {
        "ms-settings:defaultapps".to_string()
    }
}

#[cfg(windows)]
#[tauri::command]
fn open_default_apps_settings(app: tauri::AppHandle) -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::{HKEY, RegKey};

    let is_registered = |hive: HKEY| -> bool {
        RegKey::predef(hive)
            .open_subkey(DEFAULT_APPS_REG_PATH)
            .and_then(|key| key.get_value::<String, _>(DEFAULT_APPS_REG_NAME))
            .is_ok()
    };

    let uri = default_apps_settings_uri(
        is_registered(HKEY_CURRENT_USER),
        is_registered(HKEY_LOCAL_MACHINE),
    );

    app.opener()
        .open_url(uri, None::<&str>)
        .map_err(|e| format!("Impossible d'ouvrir les réglages Windows : {e}"))
}

#[cfg(not(windows))]
#[tauri::command]
fn open_default_apps_settings() -> Result<(), String> {
    Err("Réglages des applications par défaut disponibles uniquement sur Windows".to_string())
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_file = find_video_arg(&std::env::args().collect::<Vec<_>>());

    let mut builder = tauri::Builder::default();

    // Must be the very first plugin registered (see tauri-plugin-single-instance
    // docs) so it can intercept a second launch before anything else runs.
    // Without this, double-clicking a second video file while Libre Media Player is
    // already open spawns a whole separate window/mpv instance instead of
    // reusing the existing one.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            focus_main_window(app);
            if let Some(path) = find_video_arg(&args) {
                // The window already exists and the frontend has long since
                // attached its listener by this point, so a plain emit (no
                // "is anyone listening yet" race like the startup path below)
                // is enough to hand off the new file.
                let _ = app.emit("open-file", path);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_libmpv::init())
        .manage(InitialFile(Mutex::new(initial_file)))
        .invoke_handler(tauri::generate_handler![
            get_initial_file,
            open_default_apps_settings
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_video_path_matches_every_supported_extension_case_insensitively() {
        for ext in VIDEO_EXTENSIONS {
            assert!(is_video_path(&format!("movie.{ext}")));
            assert!(is_video_path(&format!("MOVIE.{}", ext.to_uppercase())));
        }
        assert!(!is_video_path("document.pdf"));
        assert!(!is_video_path("no-extension"));
    }

    #[test]
    fn find_video_arg_skips_argv0_and_non_video_args() {
        let args = vec![
            "libre-media-player.exe".to_string(),
            "--some-flag".to_string(),
            "C:\\videos\\movie.mkv".to_string(),
        ];
        assert_eq!(
            find_video_arg(&args),
            Some("C:\\videos\\movie.mkv".to_string())
        );
    }

    #[test]
    fn find_video_arg_returns_none_when_no_arg_looks_like_a_video() {
        let args = vec!["libre-media-player.exe".to_string(), "--flag".to_string()];
        assert_eq!(find_video_arg(&args), None);
    }

    // Covers open_default_apps_settings' URI-selection logic (the part that
    // doesn't need a real Windows registry): HKCU takes priority over HKLM
    // (a normal per-user NSIS install only ever writes HKCU, but a future
    // perMachine/both install mode could have both -- HKCU should still
    // win since it's what NSIS_HOOK_POSTINSTALL's default produces), HKLM
    // is used when that's the only one registered, and an app registered
    // in neither falls back to the generic (non-deep-linked) settings page
    // instead of producing a URI pointing at a registration that doesn't
    // exist.
    #[cfg(windows)]
    #[test]
    fn default_apps_settings_uri_prefers_hkcu_over_hklm() {
        assert_eq!(
            default_apps_settings_uri(true, true),
            "ms-settings:defaultapps?registeredAppUser=Libre%20Media%20Player",
        );
    }

    #[cfg(windows)]
    #[test]
    fn default_apps_settings_uri_falls_back_to_hklm_when_only_machine_registered() {
        assert_eq!(
            default_apps_settings_uri(false, true),
            "ms-settings:defaultapps?registeredAppMachine=Libre%20Media%20Player",
        );
    }

    #[cfg(windows)]
    #[test]
    fn default_apps_settings_uri_falls_back_to_generic_page_when_unregistered() {
        assert_eq!(
            default_apps_settings_uri(false, false),
            "ms-settings:defaultapps"
        );
    }
}
