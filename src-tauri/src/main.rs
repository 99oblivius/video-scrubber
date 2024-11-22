// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use ffmpeg_next::{self as ffmpeg, format};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![compress_video])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    video_editor_lib::run()
}

#[tauri::command]
async fn compress_video(
    source_path: String,
    container: String,
    video_codec: String,
    audio_codec: String,
    quality: i32,
    output_name: String,
) -> Result<(), String> {
    ffmpeg::init().unwrap();

    let mut ictx = format::input(&source_path).unwrap();
    let mut octx = format::output(&output_name).unwrap();

    Ok(())
}