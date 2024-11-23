#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
struct SourceInfo {
    path: String,
    name: String,
    size: u64,
    container: String,
    duration: f64,
    width: u32,
    height: u32
}

#[derive(Debug, Serialize, Deserialize)]
struct OutputInfo {
    path: String,
    container: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CompressionSettings {
    video_codec: String,
    audio_codec: String,
    quality: i32,
    container: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TrimSettings {
    start_time: f64,  // in seconds
    end_time: f64,    // in seconds
}

#[derive(Debug, Serialize, Deserialize)]
struct CropSettings {
    width: u32,
    height: u32,
    x: u32,
    y: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct Changes {
    compression: Option<CompressionSettings>,
    trim: Option<TrimSettings>,
    crop: Option<CropSettings>
}

#[derive(Debug, Serialize, Deserialize)]
struct SaveOperation {
    source: SourceInfo,
    output: OutputInfo,
    changes: Changes,
}

// Utility function to map video codecs to ffmpeg parameters
fn get_video_codec_param(codec: &str) -> &'static str {
    match codec {
        "h264" => "libx264",
        "h265" => "libx265",
        "av1" => "libaom-av1",
        "vp8" => "libvpx",
        "vp9" => "libvpx-vp9",
        _ => "libx264"  // default to h264
    }
}

// Utility function to map audio codecs to ffmpeg parameters
fn get_audio_codec_param(codec: &str) -> &'static str {
    match codec {
        "aac" => "aac",
        "mp3" => "libmp3lame",
        "opus" => "libopus",
        "vorbis" => "libvorbis",
        "ac3" => "ac3",
        "flac" => "flac",
        _ => "aac"  // default to aac
    }
}

// Function to build ffmpeg command based on save operation
fn build_ffmpeg_command(operation: &SaveOperation) -> Command {
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-i").arg(&operation.source.path);

    // Add trim settings if present
    if let Some(trim) = &operation.changes.trim {
        cmd.arg("-ss").arg(trim.start_time.to_string());
        cmd.arg("-to").arg(trim.end_time.to_string());
    }

    dbg!(operation);
    
    // Add video codec and quality settings if compression is present
    if let Some(compression) = &operation.changes.compression {
        let video_codec = get_video_codec_param(&compression.video_codec);
        let audio_codec = get_audio_codec_param(&compression.audio_codec);

        cmd.arg("-c:v").arg(video_codec);
        cmd.arg("-c:a").arg(audio_codec);

        // Quality settings (using CRF for H.264/H.265, bitrate for others)
        if video_codec == "libx264" || video_codec == "libx265" {
            // Convert quality percentage to CRF (0-100 to 51-0, lower is better)
            let crf = ((100 - compression.quality) as f32 * 0.51) as i32;
            cmd.arg("-crf").arg(crf.to_string());
        } else {
            // For other codecs, use quality as bitrate multiplier
            let bitrate = (compression.quality as f32 * 0.2) as i32; // Example: 100% = 20Mbps
            cmd.arg("-b:v").arg(format!("{}M", bitrate));
        }
    }

    // Add crop settings if present
    if let Some(crop) = &operation.changes.crop {
        let filter = format!("crop={}:{}:{}:{}", 
            crop.width, crop.height, crop.x, crop.y);
        cmd.arg("-vf").arg(filter);
    }

    // Add output settings
    cmd.arg("-y").arg(&operation.output.path);

    cmd
}

#[tauri::command]
async fn save_video(operation: SaveOperation) -> Result<(), String> {
    // Build the ffmpeg command
    let mut cmd = build_ffmpeg_command(&operation);

    // Execute the command
    match cmd.output() {
        Ok(output) => {
            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                Err(format!("FFmpeg error: {}", error))
            } else {
                Ok(())
            }
        }
        Err(e) => Err(format!("Failed to execute FFmpeg: {}", e))
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![save_video])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}