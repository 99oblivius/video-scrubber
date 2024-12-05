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
        cmd.arg("-crf").arg(compression.quality.to_string());
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



#[derive(Debug, Serialize, Deserialize)]
pub struct StreamInfo {
    // Core codec information
    pub codec_type: String,
    #[serde(default)]
    pub codec_name: Option<String>,
    pub codec_long_name: Option<String>,
    pub profile: Option<String>,
    pub level: Option<i32>,

    // Frame-related
    pub avg_frame_rate: String,
    pub nb_frames: Option<i32>,
    pub r_frame_rate: String,

    // Audio-specific
    pub bit_rate: Option<String>,
    pub channels: Option<i32>,
    pub sample_rate: Option<String>,

    // Video-specific
    pub color_space: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FFprobeOutput {
    pub streams: Vec<StreamInfo>,
}

#[tauri::command]
async fn get_video_info(path: String) -> Result<FFprobeOutput, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            &path
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    let parsed = serde_json::from_str(&output_str)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;
    Ok(parsed)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![save_video, get_video_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}