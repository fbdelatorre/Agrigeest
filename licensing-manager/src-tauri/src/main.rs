#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod checkout_url;

#[tauri::command]
async fn open_payment_checkout(url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || checkout_url::open_checkout(&url))
        .await
        .map_err(|_| "Não foi possível abrir o navegador. Use Copiar link.".to_string())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_payment_checkout])
        .run(tauri::generate_context!())
        .expect("Falha ao iniciar o gestor de licencas");
}
