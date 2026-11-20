#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // No business-data commands, filesystem plugins or production services.
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to start isolated licensing laboratory");
}
