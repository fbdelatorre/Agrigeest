#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[path = "../../../src-tauri/src/field_store.rs"]
mod field_store;
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![field_store::list_field_entries,field_store::put_field_entry,field_store::discard_field_entry])
        .run(tauri::generate_context!())
        .expect("Falha ao iniciar o AgriGest piloto local");
}
