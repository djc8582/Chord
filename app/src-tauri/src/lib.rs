mod commands;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize the shared application state.
    let app_state = AppState::new();

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
        .run(tauri::generate_context!())
        .expect("error while running Chord");
}
