#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;

struct ProcessHandle {
    child: Child,
    is_ffmpeg: bool,
}

static ACTIVE_PROCESSES: Lazy<Mutex<HashMap<String, Arc<Mutex<Option<ProcessHandle>>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static PROCESS_UUIDS: Lazy<Mutex<HashMap<String, String>>> = 
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SourceInfo {
    path: String,
    name: String,
    size: u64,
    container: String,
    duration: f64,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RemoteSourceInfo {
    path: String,
    name: String,
    is_stream: bool,
    streaming_url: Option<String>,
    width: u32,
    height: u32,
    duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OutputInfo {
    path: String,
    container: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CompressionSettings {
    video_codec: String,
    audio_codec: String,
    quality: i32,
    container: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TrimSettings {
    start_time: f64,
    end_time: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CropSettings {
    width: u32,
    height: u32,
    x: u32,
    y: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Changes {
    compression: Option<CompressionSettings>,
    trim: Option<TrimSettings>,
    crop: Option<CropSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SaveOperation {
    source: SourceInfo,
    output: OutputInfo,
    changes: Changes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    vcodec: Option<String>,
    acodec: Option<String>,
    ext: Option<String>,
    video_ext: Option<String>,
    audio_ext: Option<String>,
    format: Option<String>,
    format_id: Option<String>,
    format_note: Option<String>,
    tbr: Option<f64>,
    vbr: Option<f64>,
    abr: Option<f64>,
    filesize: Option<u64>,
    filesize_approx: Option<u64>,
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

#[derive(Debug, Clone, Serialize)]
struct QueueProgress {
    queue_id: String,
    progress: f64,
    speed: Option<String>,
    eta: Option<String>,
    status: String,
    current_size: Option<u64>,
    total_size: Option<u64>,
}

fn get_binary_path(app: &AppHandle, binary: &str) -> PathBuf {
    let bin_name = if cfg!(windows) {
        format!("{}.exe", binary)
    } else {
        binary.to_string()
    };
    app.path()
        .resource_dir()
        .expect("Failed to get resource dir")
        .join("resources")
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

fn parse_ffmpeg_progress(line: &str, total_duration: f64) -> Option<f64> {
    if let Some(time_pos) = line.find("time=") {
        let time_str = &line[time_pos + 5..];
        if let Some(space_pos) = time_str.find(' ') {
            let time_part = &time_str[..space_pos];
            let parts: Vec<&str> = time_part.split(':').collect();
            if parts.len() == 3 {
                if let (Ok(h), Ok(m), Ok(s)) = (
                    parts[0].parse::<f64>(),
                    parts[1].parse::<f64>(),
                    parts[2].parse::<f64>(),
                ) {
                    let current_time = h * 3600.0 + m * 60.0 + s;
                    return Some((current_time / total_duration) * 100.0);
                }
            }
        }
    }
    None
}

fn parse_ytdlp_progress(line: &str) -> Option<(f64, Option<String>, Option<String>)> {
    if line.contains("[download]") && line.contains("%") {
        if let Some(percent_start) = line.find(' ') {
            let remaining = &line[percent_start + 1..];
            if let Some(percent_end) = remaining.find('%') {
                let percent_str = &remaining[..percent_end];
                if let Ok(percent) = percent_str.trim().parse::<f64>() {
                    let mut speed = None;
                    let mut eta = None;

                    if let Some(speed_pos) = line.find(" at ") {
                        let speed_str = &line[speed_pos + 4..];
                        if let Some(speed_end) = speed_str.find(" ETA") {
                            speed = Some(speed_str[..speed_end].to_string());
                        } else if let Some(speed_end) = speed_str.find(' ') {
                            speed = Some(speed_str[..speed_end].to_string());
                        }
                    }

                    if let Some(eta_pos) = line.find(" ETA ") {
                        let eta_str = &line[eta_pos + 5..];
                        eta = Some(eta_str.trim().to_string());
                    }

                    return Some((percent, speed, eta));
                }
            }
        }
    }
    None
}

fn get_temp_dir() -> PathBuf {
    std::env::temp_dir().join(".vditmp")
}

fn ensure_temp_dir() -> Result<PathBuf, String> {
    let temp_dir = get_temp_dir();
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    Ok(temp_dir)
}

fn cleanup_temp_files(uuid: &str) -> Result<(), String> {
    let temp_dir = get_temp_dir();
    if !temp_dir.exists() {
        return Ok(());
    }

    let entries = std::fs::read_dir(&temp_dir)
        .map_err(|e| format!("Failed to read temp directory: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let file_name = entry.file_name();
            let file_name_str = file_name.to_string_lossy();
            if file_name_str.contains(uuid) {
                let path = entry.path();
                if path.is_file() {
                    let _ = std::fs::remove_file(&path);
                } else if path.is_dir() {
                    let _ = std::fs::remove_dir_all(&path);
                }
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn terminate_process_tree(pid: u32) -> Result<(), String> {
    Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to terminate process tree: {}", e))?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn terminate_process_tree(pid: u32) -> Result<(), String> {
    Command::new("pkill")
        .args(["-TERM", "-P", &pid.to_string()])
        .output()
        .map_err(|e| format!("Failed to terminate process tree: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn terminate_process(queue_id: String) -> Result<(), String> {
    let uuid = {
        let uuids = PROCESS_UUIDS.lock().unwrap();
        uuids.get(&queue_id).cloned()
    };
    
    let mut processes = ACTIVE_PROCESSES.lock().unwrap();
    if let Some(process_arc) = processes.remove(&queue_id) {
        let mut process_opt = process_arc.lock().unwrap();
        if let Some(mut handle) = process_opt.take() {
            let pid = handle.child.id();

            if handle.is_ffmpeg {
                if let Some(mut stdin) = handle.child.stdin.take() {
                    let _ = stdin.write_all(b"q");
                    let _ = stdin.flush();
                    drop(stdin);

                    let uuid_for_cleanup = uuid.clone();
                    thread::spawn(move || {
                        thread::sleep(std::time::Duration::from_secs(2));
                        if let Ok(None) = handle.child.try_wait() {
                            let _ = terminate_process_tree(pid);
                        }
                        if let Some(uuid) = uuid_for_cleanup {
                            let _ = cleanup_temp_files(&uuid);
                        }
                    });
                    {
                        let mut uuids = PROCESS_UUIDS.lock().unwrap();
                        uuids.remove(&queue_id);
                    }
                    
                    return Ok(());
                }
            }

            let _ = terminate_process_tree(pid);
            if let Some(uuid) = &uuid {
                let _ = cleanup_temp_files(uuid);
            }
            {
                let mut uuids = PROCESS_UUIDS.lock().unwrap();
                uuids.remove(&queue_id);
            }
            
            Ok(())
        } else {
            if let Some(uuid) = &uuid {
                let _ = cleanup_temp_files(uuid);
            }
            {
                let mut uuids = PROCESS_UUIDS.lock().unwrap();
                uuids.remove(&queue_id);
            }
            
            Ok(())
        }
    } else {
        if let Some(uuid) = &uuid {
            let _ = cleanup_temp_files(uuid);
        }
        {
            let mut uuids = PROCESS_UUIDS.lock().unwrap();
            uuids.remove(&queue_id);
        }
        
        Ok(())
    }
}

fn terminate_all_processes() {
    let mut processes = ACTIVE_PROCESSES.lock().unwrap();
    let process_ids: Vec<String> = processes.keys().cloned().collect();
    
    for queue_id in process_ids {
        if let Some(process_arc) = processes.remove(&queue_id) {
            let mut process_opt = process_arc.lock().unwrap();
            if let Some(mut handle) = process_opt.take() {
                let pid = handle.child.id();
                
                if handle.is_ffmpeg {
                    if let Some(mut stdin) = handle.child.stdin.take() {
                        let _ = stdin.write_all(b"q");
                        let _ = stdin.flush();
                        drop(stdin);
                        
                        thread::sleep(std::time::Duration::from_millis(100));
                        if let Ok(None) = handle.child.try_wait() {
                            let _ = terminate_process_tree(pid);
                        }
                    } else {
                        let _ = terminate_process_tree(pid);
                    }
                } else {
                    let _ = terminate_process_tree(pid);
                }
            }
        }
    }
}

fn build_ffmpeg_command(app: &AppHandle, operation: &SaveOperation) -> Command {
    let mut cmd = Command::new(get_binary_path(app, "ffmpeg"));
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .arg("-i")
        .arg(&operation.source.path)
        .arg("-progress")
        .arg("-")
        .arg("-nostats");

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
        let filter = format!(
            "crop={}:{}:{}:{}",
            crop.width, crop.height, crop.x, crop.y
        );
        cmd.arg("-vf").arg(filter);
    }

    cmd.arg("-y").arg(&operation.output.path);
    cmd
}

#[tauri::command]
async fn save_video(
    app: AppHandle,
    operation: SaveOperation,
    queue_id: String,
) -> Result<(), String> {
    let uuid = Uuid::new_v4().to_string();
    {
        let mut uuids = PROCESS_UUIDS.lock().unwrap();
        uuids.insert(queue_id.clone(), uuid.clone());
    }
    let temp_dir = ensure_temp_dir()?;
    
    let output_ext = Path::new(&operation.output.path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");
    let temp_file = temp_dir.join(format!("{}.{}", uuid, output_ext));
    let temp_path = temp_file.to_string_lossy().to_string();
    
    let total_duration = operation.source.duration;
    
    let temp_operation = SaveOperation {
        source: operation.source.clone(),
        output: OutputInfo {
            path: temp_path.clone(),
            container: operation.output.container.clone(),
        },
        changes: operation.changes.clone(),
    };
    
    let mut cmd = build_ffmpeg_command(&app, &temp_operation);

    let mut child = cmd.spawn().map_err(|e| {
        let _ = cleanup_temp_files(&uuid);
        format!("FFmpeg error: {}", e)
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        let _ = cleanup_temp_files(&uuid);
        "Failed to capture stderr".to_string()
    })?;

    let child_arc = Arc::new(Mutex::new(Some(ProcessHandle {
        child,
        is_ffmpeg: true,
    })));
    {
        let mut processes = ACTIVE_PROCESSES.lock().unwrap();
        processes.insert(queue_id.clone(), child_arc.clone());
    }

    let reader = BufReader::new(stderr);
    let queue_id_for_thread = queue_id.clone();
    let app_clone = app.clone();

    thread::spawn(move || {
        for line in reader.lines() {
            if let Ok(line) = line {
                if let Some(progress) = parse_ffmpeg_progress(&line, total_duration) {
                    let _ = app_clone.emit(
                        "queue-progress",
                        QueueProgress {
                            queue_id: queue_id_for_thread.clone(),
                            progress,
                            speed: None,
                            eta: None,
                            status: "processing".to_string(),
                            current_size: None,
                            total_size: None,
                        },
                    );
                }
            }
        }
    });

    let exit_status = loop {
        thread::sleep(std::time::Duration::from_millis(100));
        let mut child_lock = child_arc.lock().unwrap();
        if let Some(ref mut handle) = *child_lock {
            match handle.child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) => continue,
                Err(e) => break Err(format!("Failed to wait for process: {}", e)),
            }
        } else {
            break Err("Process was terminated".to_string());
        }
    };

    {
        let mut processes = ACTIVE_PROCESSES.lock().unwrap();
        processes.remove(&queue_id);
    }
    {
        let mut uuids = PROCESS_UUIDS.lock().unwrap();
        uuids.remove(&queue_id);
    }

    match exit_status {
        Ok(status) if status.success() => {
            match std::fs::rename(&temp_path, &operation.output.path) {
                Ok(_) => {
                    let _ = cleanup_temp_files(&uuid);
                    Ok(())
                }
                Err(e) => {
                    let _ = cleanup_temp_files(&uuid);
                    Err(format!("Failed to move file to final destination: {}", e))
                }
            }
        }
        Ok(_) => {
            let _ = cleanup_temp_files(&uuid);
            Err("FFmpeg processing failed".to_string())
        }
        Err(e) => {
            let _ = cleanup_temp_files(&uuid);
            Err(e)
        }
    }
}

#[tauri::command]
async fn process_remote_video(
    app: AppHandle,
    operation: RemoteSaveOperation,
    queue_id: String,
) -> Result<(), String> {
    let uuid = Uuid::new_v4().to_string();
    {
        let mut uuids = PROCESS_UUIDS.lock().unwrap();
        uuids.insert(queue_id.clone(), uuid.clone());
    }
    
    let temp_dir = ensure_temp_dir()?;
    
    let ytdlp_path = get_binary_path(&app, "yt-dlp");
    let ffmpeg_path = get_binary_path(&app, "ffmpeg");
    let output_ext = Path::new(&operation.output.path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");
    let source_url = operation.source.path.clone();
    let temp_file = temp_dir.join(format!("{}.{}", uuid, output_ext));
    let temp_path = temp_file.to_string_lossy().to_string();

    let mut ytdlp_cmd = Command::new(&ytdlp_path);
    ytdlp_cmd
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .args([
            "-f",
            "bv*+ba/best",
            "-o",
            &temp_path,
            "--ffmpeg-location",
            &ffmpeg_path.to_string_lossy(),
            "--remux-video",
            output_ext,
            "--no-playlist",
            "--progress",
            "--newline",
        ]);

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

    ytdlp_cmd.arg(&source_url);

    let mut child = ytdlp_cmd
        .spawn()
        .map_err(|e| {
            let _ = cleanup_temp_files(&uuid);
            let mut uuids = PROCESS_UUIDS.lock().unwrap();
            uuids.remove(&queue_id);
            format!("Failed to start yt-dlp: {}", e)
        })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        let _ = cleanup_temp_files(&uuid);
        let mut uuids = PROCESS_UUIDS.lock().unwrap();
        uuids.remove(&queue_id);
        "Failed to capture stdout".to_string()
    })?;

    let child_arc = Arc::new(Mutex::new(Some(ProcessHandle {
        child,
        is_ffmpeg: false,
    })));
    {
        let mut processes = ACTIVE_PROCESSES.lock().unwrap();
        processes.insert(queue_id.clone(), child_arc.clone());
    }

    let reader = BufReader::new(stdout);
    let queue_id_for_thread = queue_id.clone();
    let app_clone = app.clone();

    thread::spawn(move || {
        for line in reader.lines() {
            if let Ok(line) = line {
                if let Some((progress, speed, eta)) = parse_ytdlp_progress(&line) {
                    let _ = app_clone.emit(
                        "queue-progress",
                        QueueProgress {
                            queue_id: queue_id_for_thread.clone(),
                            progress,
                            speed,
                            eta,
                            status: "downloading".to_string(),
                            current_size: None,
                            total_size: None,
                        },
                    );
                }
            }
        }
    });

    let download_exit_status = loop {
        thread::sleep(std::time::Duration::from_millis(100));
        let mut child_lock = child_arc.lock().unwrap();
        if let Some(ref mut handle) = *child_lock {
            match handle.child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) => continue,
                Err(e) => break Err(format!("Failed to wait for yt-dlp: {}", e)),
            }
        } else {
            break Err("Download was terminated".to_string());
        }
    };

    {
        let mut processes = ACTIVE_PROCESSES.lock().unwrap();
        processes.remove(&queue_id);
    }

    match download_exit_status {
        Ok(status) if !status.success() => {
            let _ = cleanup_temp_files(&uuid);
            let mut uuids = PROCESS_UUIDS.lock().unwrap();
            uuids.remove(&queue_id);
            return Err("Download failed or was cancelled".to_string());
        }
        Err(e) => {
            let _ = cleanup_temp_files(&uuid);
            let mut uuids = PROCESS_UUIDS.lock().unwrap();
            uuids.remove(&queue_id);
            return Err(e);
        }
        _ => {}
    }

    let actual_width: u32;
    let actual_height: u32;

    let probe_output = Command::new(get_binary_path(&app, "ffprobe"))
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .args([
            "-v",
            "quiet",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=s=x:p=0",
            &temp_path,
        ])
        .output()
        .map_err(|e| {
            let _ = cleanup_temp_files(&uuid);
            let mut uuids = PROCESS_UUIDS.lock().unwrap();
            uuids.remove(&queue_id);
            format!("Failed to get video dimensions: {}", e)
        })?;

    if !probe_output.status.success() {
        let _ = cleanup_temp_files(&uuid);
        let mut uuids = PROCESS_UUIDS.lock().unwrap();
        uuids.remove(&queue_id);
        return Err(format!(
            "FFprobe dimension query failed: {}",
            String::from_utf8_lossy(&probe_output.stderr)
        ));
    }

    let dimensions_str = String::from_utf8_lossy(&probe_output.stdout)
        .trim()
        .to_string();
    let dimensions: Vec<&str> = dimensions_str.split('x').collect();

    if dimensions.len() != 2 {
        let _ = cleanup_temp_files(&uuid);
        let mut uuids = PROCESS_UUIDS.lock().unwrap();
        uuids.remove(&queue_id);
        return Err(format!(
            "Could not parse video dimensions: {}",
            dimensions_str
        ));
    }

    actual_width = dimensions[0]
        .parse()
        .map_err(|_| {
            let _ = cleanup_temp_files(&uuid);
            let mut uuids = PROCESS_UUIDS.lock().unwrap();
            uuids.remove(&queue_id);
            format!("Invalid width value: {}", dimensions[0])
        })?;
    actual_height = dimensions[1]
        .parse()
        .map_err(|_| {
            let _ = cleanup_temp_files(&uuid);
            let mut uuids = PROCESS_UUIDS.lock().unwrap();
            uuids.remove(&queue_id);
            format!("Invalid height value: {}", dimensions[1])
        })?;

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
            crop.y = ((crop.y as f64 * height_scale).round() as u32)
                .min(actual_height - crop.height);

            if crop.width % 2 != 0 {
                crop.width -= 1;
            }
            if crop.height % 2 != 0 {
                crop.height -= 1;
            }
            if crop.x % 2 != 0 {
                crop.x -= 1;
            }
            if crop.y % 2 != 0 {
                crop.y -= 1;
            }

            if crop.x + crop.width > actual_width {
                crop.x = actual_width - crop.width;
            }
            if crop.y + crop.height > actual_height {
                crop.y = actual_height - crop.height;
            }
        }
    }

    if !(adjusted_changes.crop.is_some() || adjusted_changes.compression.is_some()) {
        match std::fs::rename(&temp_path, &operation.output.path) {
            Ok(_) => {
                let _ = cleanup_temp_files(&uuid);
                let mut uuids = PROCESS_UUIDS.lock().unwrap();
                uuids.remove(&queue_id);
                return Ok(());
            }
            Err(e) => {
                let _ = cleanup_temp_files(&uuid);
                let mut uuids = PROCESS_UUIDS.lock().unwrap();
                uuids.remove(&queue_id);
                return Err(format!("Failed to save file: {}", e));
            }
        }
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

    let total_duration = postprocess_operation.source.duration;
    let mut ffmpeg_cmd = build_ffmpeg_command(&app, &postprocess_operation);
    let mut ffmpeg_child = ffmpeg_cmd
        .spawn()
        .map_err(|e| {
            let _ = cleanup_temp_files(&uuid);
            let mut uuids = PROCESS_UUIDS.lock().unwrap();
            uuids.remove(&queue_id);
            format!("Failed to execute FFmpeg: {}", e)
        })?;
    let stderr = ffmpeg_child
        .stderr
        .take()
        .ok_or_else(|| {
            let _ = cleanup_temp_files(&uuid);
            let mut uuids = PROCESS_UUIDS.lock().unwrap();
            uuids.remove(&queue_id);
            "Failed to capture stderr".to_string()
        })?;

    let ffmpeg_child_arc = Arc::new(Mutex::new(Some(ProcessHandle {
        child: ffmpeg_child,
        is_ffmpeg: true,
    })));
    {
        let mut processes = ACTIVE_PROCESSES.lock().unwrap();
        processes.insert(queue_id.clone(), ffmpeg_child_arc.clone());
    }

    let reader = BufReader::new(stderr);
    let queue_id_for_ffmpeg_thread = queue_id.clone();
    let app_clone = app.clone();

    thread::spawn(move || {
        for line in reader.lines() {
            if let Ok(line) = line {
                if let Some(progress) = parse_ffmpeg_progress(&line, total_duration) {
                    let _ = app_clone.emit(
                        "queue-progress",
                        QueueProgress {
                            queue_id: queue_id_for_ffmpeg_thread.clone(),
                            progress,
                            speed: None,
                            eta: None,
                            status: "processing".to_string(),
                            current_size: None,
                            total_size: None,
                        },
                    );
                }
            }
        }
    });

    let ffmpeg_exit_status = loop {
        thread::sleep(std::time::Duration::from_millis(100));
        let mut child_lock = ffmpeg_child_arc.lock().unwrap();
        if let Some(ref mut handle) = *child_lock {
            match handle.child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) => continue,
                Err(e) => break Err(format!("Failed to wait for FFmpeg: {}", e)),
            }
        } else {
            break Err("Processing was terminated".to_string());
        }
    };

    {
        let mut processes = ACTIVE_PROCESSES.lock().unwrap();
        processes.remove(&queue_id);
    }
    {
        let mut uuids = PROCESS_UUIDS.lock().unwrap();
        uuids.remove(&queue_id);
    }

    let _ = cleanup_temp_files(&uuid);

    match ffmpeg_exit_status {
        Ok(status) if status.success() => Ok(()),
        Ok(_) => Err("FFmpeg processing failed".to_string()),
        Err(e) => Err(e),
    }
}

#[tauri::command]
async fn get_video_info(app: AppHandle, path: String) -> Result<FFprobeOutput, String> {
    let output = Command::new(get_binary_path(&app, "ffprobe"))
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
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
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
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
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .arg("--no-playlist");

    if let Some(format) = format_preference {
        cmd.args(["-f", &format]);
    } else {
        cmd.args(["-f", "b"]);
    }

    cmd.args(["--get-url", &url]);
    let output = cmd
        .output()
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
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(version)
}

#[tauri::command]
fn show_app_window(window: tauri::Window) -> Result<(), String> {
    window.show().unwrap();
    window.set_focus().unwrap();
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            save_video,
            get_video_info,
            process_remote_video,
            get_yt_video_info,
            get_best_streaming_url,
            check_ytdlp_version,
            show_app_window,
            terminate_process
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