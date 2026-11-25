#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[path = "../../../src-tauri/src/field_store.rs"]
mod field_store;
mod local_portal;
#[tauri::command]
async fn open_pilot_page(page:String)->Result<(),String>{tauri::async_runtime::spawn_blocking(move||local_portal::open(&page)).await.map_err(|_|"Não foi possível abrir o navegador.".to_string())?}
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![field_store::list_field_entries,field_store::put_field_entry,field_store::discard_field_entry,open_pilot_page])
        .run(tauri::generate_context!())
        .expect("Falha ao iniciar o AgriGest piloto local");
}
