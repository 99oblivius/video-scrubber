#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::os::windows::process::CommandExt;
use std::process::Command;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

// --------- Data Structures ---------

#[derive(Debug, Serialize, Deserialize)]
struct SourceInfo {
    path: String,
    name: String,
    size: u64,
    container: String,
    duration: f64,
    width: u32,
    height: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct RemoteSourceInfo {
    path: String,
    name: String,
    is_stream: bool,
    streaming_url: Option<String>,
    width: u32,
    height: u32,
    duration: f64,
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
    start_time: f64,
    end_time: f64,
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
    crop: Option<CropSettings>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SaveOperation {
    source: SourceInfo,
    output: OutputInfo,
    changes: Changes,
}

#[derive(Debug, Serialize, Deserialize)]
struct RemoteSaveOperation {
    source: RemoteSourceInfo,
    output: OutputInfo,
    changes: Changes,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamInfo {
    pub codec_type: String,
    #[serde(default)]
    pub codec_name: Option<String>,
    pub codec_long_name: Option<String>,
    pub profile: Option<String>,
    pub level: Option<i32>,
    pub avg_frame_rate: String,
    pub nb_frames: Option<String>,
    pub r_frame_rate: String,
    pub bit_rate: Option<String>,
    pub channels: Option<i32>,
    pub sample_rate: Option<String>,
    pub color_space: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FFprobeOutput {
    pub streams: Vec<StreamInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YtVideoInfo {
    title: String,
    formats: Option<Vec<Format>>,
    thumbnails: Option<Vec<Thumbnail>>,
    duration: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Format {
    format_id: String,
    url: String,
    height: Option<u32>,
    width: Option<u32>,
    fps: Option<f64>,
    format_note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Thumbnail {
    url: String,
    height: Option<u32>,
    width: Option<u32>,
}

// --------- Utility Functions ---------

/// Returns the path to a bundled binary (e.g., ffmpeg, yt-dlp) for the current platform.
fn get_binary_path(app: &AppHandle, binary: &str) -> PathBuf {
    let bin_name = if cfg!(windows) {
        format!("{}.exe", binary)
    } else {
        binary.to_string()
    };
    app.path()
        .resource_dir()
        .expect("Failed to get resource dir")
        .join("bin")
        .join(bin_name)
}

fn get_video_codec_param(codec: &str) -> &'static str {
    match codec {
        "h264" => "libx264",
        "h265" => "libx265",
        "av1" => "libaom-av1",
        "vp8" => "libvpx",
        "vp9" => "libvpx-vp9",
        _ => "libx264",
    }
}

fn get_audio_codec_param(codec: &str) -> &'static str {
    match codec {
        "aac" => "aac",
        "mp3" => "libmp3lame",
        "opus" => "libopus",
        "vorbis" => "libvorbis",
        "ac3" => "ac3",
        "flac" => "flac",
        _ => "aac",
    }
}

/// Builds an ffmpeg command for local video processing based on the provided operation.
fn build_ffmpeg_command(app: &AppHandle, operation: &SaveOperation) -> Command {
    let mut cmd = Command::new(get_binary_path(app, "ffmpeg"));
    cmd.creation_flags(0x08000000) // CREATE_NO_WINDOW for Windows
        .arg("-i")
        .arg(&operation.source.path);

    if let Some(trim) = &operation.changes.trim {
        cmd.arg("-ss").arg(trim.start_time.to_string());
        cmd.arg("-to").arg(trim.end_time.to_string());
    }

    if let Some(compression) = &operation.changes.compression {
        let video_codec = get_video_codec_param(&compression.video_codec);
        let audio_codec = get_audio_codec_param(&compression.audio_codec);
        cmd.arg("-c:v")
            .arg(video_codec)
            .arg("-c:a")
            .arg(audio_codec)
            .arg("-crf")
            .arg(compression.quality.to_string());
    }

    if let Some(crop) = &operation.changes.crop {
        let filter = format!("crop={}:{}:{}:{}", crop.width, crop.height, crop.x, crop.y);
        cmd.arg("-vf").arg(filter);
    }

    cmd.arg("-y").arg(&operation.output.path);
    cmd
}

// --------- Tauri Commands ---------

#[tauri::command]
async fn save_video(app: AppHandle, operation: SaveOperation) -> Result<(), String> {
    let mut cmd = build_ffmpeg_command(&app, &operation);
    let output = cmd.output().map_err(|e| format!("FFmpeg error: {}", e))?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg error: {}", error))
    } else {
        Ok(())
    }
}

#[tauri::command]
async fn process_remote_video(app: AppHandle, operation: RemoteSaveOperation) -> Result<(), String> {
    let ytdlp_path = get_binary_path(&app, "yt-dlp");
    let ffmpeg_path = get_binary_path(&app, "ffmpeg");
    let output_ext = Path::new(&operation.output.path).extension().and_then(|e| e.to_str()).unwrap_or("mp4");
    let source_url = operation.source.path;
    let temp_file = std::env::temp_dir().join(".vditmp.mp4");
    let temp_path = temp_file.to_string_lossy().to_string();

    let mut ytdlp_cmd = Command::new(&ytdlp_path);
    ytdlp_cmd.args([
        "-f", "bv*+ba/best", 
        "-o", &temp_path, 
        "--merge-output-format", output_ext,
        "--ffmpeg-location", &ffmpeg_path.to_string_lossy(), 
        "--no-playlist"]);

    if let Some(trim) = &operation.changes.trim {
        let format_time = |seconds: f64| -> String {
            let hours = (seconds / 3600.0) as u32;
            let minutes = ((seconds % 3600.0) / 60.0) as u32;
            let secs = (seconds % 60.0) as u32;
            let ms = ((seconds % 1.0) * 1000.0) as u32;
            format!("{:02}:{:02}:{:02}.{:03}", hours, minutes, secs, ms)
        };
        let start_time = format_time(trim.start_time);
        let end_time = format_time(trim.end_time);
        let sections = format!("*{}-{}", start_time, end_time);
        ytdlp_cmd.args(["--download-sections", &sections]);
    }

    ytdlp_cmd.arg(source_url);
    let download_result = ytdlp_cmd.output()
        .map_err(|e| format!("Failed to download with yt-dlp: {}", e))?;
    if !download_result.status.success() {
        return Err(String::from_utf8_lossy(&download_result.stderr).into_owned());
    }
    
    let actual_width: u32;
    let actual_height: u32;
    
    let probe_output = Command::new(get_binary_path(&app, "ffprobe"))
        .creation_flags(0x08000000)
        .args([
            "-v", "quiet",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=s=x:p=0",
            &temp_path,
        ])
        .output()
        .map_err(|e| format!("Failed to get video dimensions: {}", e))?;
    
    if !probe_output.status.success() {
        return Err(format!("FFprobe dimension query failed: {}", 
            String::from_utf8_lossy(&probe_output.stderr)));
    }
    
    let dimensions_str = String::from_utf8_lossy(&probe_output.stdout).trim().to_string();
    let dimensions: Vec<&str> = dimensions_str.split('x').collect();
    
    if dimensions.len() != 2 {
        return Err(format!("Could not parse video dimensions: {}", dimensions_str));
    }
    
    actual_width = dimensions[0].parse().map_err(|_| format!("Invalid width value: {}", dimensions[0]))?;
    actual_height = dimensions[1].parse().map_err(|_| format!("Invalid height value: {}", dimensions[1]))?;

    let mut adjusted_changes = operation.changes;
    if let Some(ref mut crop) = adjusted_changes.crop {
        let source_width = operation.source.width;
        let source_height = operation.source.height;
        
        if actual_width != source_width || actual_height != source_height {
            let width_scale = actual_width as f64 / source_width as f64;
            let height_scale = actual_height as f64 / source_height as f64;
            
            crop.width = ((crop.width as f64 * width_scale).round() as u32).max(2);
            crop.height = ((crop.height as f64 * height_scale).round() as u32).max(2);
            crop.x = ((crop.x as f64 * width_scale).round() as u32).min(actual_width - crop.width);
            crop.y = ((crop.y as f64 * height_scale).round() as u32).min(actual_height - crop.height);
            
            if crop.width % 2 != 0 { crop.width -= 1; }
            if crop.height % 2 != 0 { crop.height -= 1; }
            if crop.x % 2 != 0 { crop.x -= 1; }
            if crop.y % 2 != 0 { crop.y -= 1; }
            
            if crop.x + crop.width > actual_width {
                crop.x = actual_width - crop.width;
            }
            if crop.y + crop.height > actual_height {
                crop.y = actual_height - crop.height;
            }
        }
    }

    if !(adjusted_changes.crop.is_some() || adjusted_changes.compression.is_some()) {
        std::fs::rename(&temp_path, &operation.output.path)
            .map_err(|e| format!("Failed to save file: {}", e))?;
        return Ok(());
    }

    let postprocess_operation = SaveOperation {
        source: SourceInfo {
            path: temp_path.clone(),
            name: operation.source.name.clone(),
            size: 0,
            container: output_ext.to_string(),
            duration: operation.source.duration,
            width: actual_width,
            height: actual_height,
        },
        output: operation.output,
        changes: adjusted_changes,
    };

    let mut ffmpeg_cmd = build_ffmpeg_command(&app, &postprocess_operation);
    let ffmpeg_result = ffmpeg_cmd.output()
        .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;
    if !ffmpeg_result.status.success() {
        return Err(String::from_utf8_lossy(&ffmpeg_result.stderr).into_owned());
    }

    if temp_file.exists() {
        let _ = std::fs::remove_file(&temp_file);
    }

    Ok(())
}

#[tauri::command]
async fn get_video_info(app: AppHandle, path: String) -> Result<FFprobeOutput, String> {
    let output = Command::new(get_binary_path(&app, "ffprobe"))
        .creation_flags(0x08000000)
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            &path,
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

#[tauri::command]
async fn get_yt_video_info(app: AppHandle, url: String) -> Result<YtVideoInfo, String> {
    let ytdlp_path = get_binary_path(&app, "yt-dlp");
    let output = Command::new(ytdlp_path)
        .creation_flags(0x08000000)
        .args(["-j", "--no-playlist", &url])
        .output()
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let parsed: YtVideoInfo = serde_json::from_str(&output_str)
        .map_err(|e| format!("Failed to parse yt-dlp output: {}", e))?;
    Ok(parsed)
}

#[tauri::command]
async fn get_best_streaming_url(
    app: AppHandle,
    url: String,
    format_preference: Option<String>,
) -> Result<String, String> {
    let ytdlp_path = get_binary_path(&app, "yt-dlp");
    let mut cmd = Command::new(ytdlp_path);
    cmd.creation_flags(0x08000000).arg("--no-playlist");

    if let Some(format) = format_preference {
        cmd.args(["-f", &format]);
    } else {
        cmd.args(["-f", "best"]);
    }

    cmd.args(["--get-url", &url]);
    let output = cmd.output()
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(url)
}

#[tauri::command]
async fn check_ytdlp_version(app: AppHandle) -> Result<String, String> {
    let ytdlp_path = get_binary_path(&app, "yt-dlp");
    let output = Command::new(&ytdlp_path)
        .creation_flags(0x08000000)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(version)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            save_video,
            get_video_info,
            process_remote_video,
            get_yt_video_info,
            get_best_streaming_url,
            check_ytdlp_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
