#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{
    apply_rename_batch, delete_tmdb_key, get_history, get_prefix_rules, get_title_aliases,
    has_tmdb_key, make_conflict_names_unique, save_prefix_rules, save_title_aliases, scan_folder,
    search_tmdb, set_tmdb_key, undo_last_batch, validate_rename_batch, AppState,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            commands::load_history_into_state(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            get_prefix_rules,
            save_prefix_rules,
            get_title_aliases,
            save_title_aliases,
            validate_rename_batch,
            make_conflict_names_unique,
            apply_rename_batch,
            get_history,
            undo_last_batch,
            has_tmdb_key,
            set_tmdb_key,
            delete_tmdb_key,
            search_tmdb
        ])
        .run(tauri::generate_context!())
        .expect("error while running Serien-Umbenenner");
}
