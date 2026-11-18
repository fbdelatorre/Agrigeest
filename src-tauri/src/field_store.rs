use rusqlite::{params, Connection};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldRow {
    scope: String,
    id: String,
    state: String,
    parent_id: Option<String>,
    payload: String,
}

fn open_store(app: &AppHandle) -> Result<Connection, String> {
    let path = app.path().app_data_dir().map_err(|err| err.to_string())?;
    std::fs::create_dir_all(&path).map_err(|err| err.to_string())?;
    let db = Connection::open(path.join("agrigest-field-data.sqlite")).map_err(|err| err.to_string())?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS field_entries (
            scope TEXT NOT NULL, id TEXT NOT NULL, state TEXT NOT NULL,
            parent_id TEXT, payload TEXT NOT NULL, PRIMARY KEY(scope, id)
        )",
    ).map_err(|err| err.to_string())?;
    Ok(db)
}

#[tauri::command]
pub fn list_field_entries(app: AppHandle, scope: String) -> Result<Vec<String>, String> {
    let db = open_store(&app)?;
    let mut query = db.prepare("SELECT payload FROM field_entries WHERE scope = ?")
        .map_err(|err| err.to_string())?;
    let rows = query.query_map([scope], |row| row.get(0)).map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<String>, _>>().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn put_field_entry(app: AppHandle, row: FieldRow) -> Result<(), String> {
    open_store(&app)?.execute(
        "INSERT OR REPLACE INTO field_entries (scope, id, state, parent_id, payload) VALUES (?, ?, ?, ?, ?)",
        params![row.scope, row.id, row.state, row.parent_id, row.payload],
    ).map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn discard_field_entry(app: AppHandle, scope: String, id: String) -> Result<(), String> {
    open_store(&app)?.execute(
        "DELETE FROM field_entries
         WHERE scope = ?1 AND (id = ?2 OR (parent_id = ?2 AND state <> 'sent'))
         AND EXISTS (SELECT 1 FROM field_entries AS blocked
                     WHERE blocked.scope = ?1 AND blocked.id = ?2 AND blocked.state = 'blocked')",
        params![scope, id],
    ).map_err(|err| err.to_string())?;
    Ok(())
}
