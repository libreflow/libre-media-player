import { invoke } from '@tauri-apps/api/core'

// Opens Windows' Default Apps settings, scoped directly to Libre Media
// Player's page when the app is registered (a normal install always
// registers it -- see windows/hooks.nsh) so the user doesn't have to hunt
// for the app in the generic list themselves. The Rust side
// (open_default_apps_settings in lib.rs) falls back to the generic
// ms-settings:defaultapps list if the app isn't registered (e.g. running
// via `tauri dev`), and returns an Err on any other platform.
export async function openDefaultAppsSettings(): Promise<void> {
  await invoke('open_default_apps_settings')
}
