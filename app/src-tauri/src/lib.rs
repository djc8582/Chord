mod api_server;
mod commands;
mod state;

use std::sync::Arc;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize the shared application state behind an Arc so it can be
    // shared between Tauri commands and the API server thread.
    let app_state = Arc::new(AppState::new());
    let api_state = Arc::clone(&app_state);

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Graph manipulation
            commands::add_node,
            commands::remove_node,
            commands::connect_ports,
            commands::disconnect,
            commands::set_parameter,
            // Transport
            commands::play,
            commands::stop,
            commands::set_tempo,
            // Audio engine / diagnostics
            commands::get_signal_stats,
            commands::run_diagnostics,
            // File / state
            commands::load_patch,
            commands::save_patch,
            commands::export_patch,
        ])
        .setup(move |app| {
            // Open devtools in debug builds so we can see console output.
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            let handle = app.handle().clone();
            api_server::start(api_state, handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Chord");
}
