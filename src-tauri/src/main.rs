#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod ffmpeg;
mod models;
mod process;
mod temp;
mod utils;
mod ytdlp;

use process::terminate_all_processes;
use temp::ensure_temp_dir;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::save_video,
            commands::get_video_info,
            commands::process_remote_video,
            commands::get_yt_video_info,
            commands::get_best_streaming_url,
            commands::check_ytdlp_version,
            commands::show_app_window,
            commands::terminate_process,
            commands::get_queue_state,
        ])
        .setup(|_app| {
            let _ = ensure_temp_dir();
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    terminate_all_processes();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}