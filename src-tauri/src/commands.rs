#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::process::PROCESSES;
use crate::ffmpeg::{build_ffmpeg_command, monitor_ffmpeg_progress};
use crate::models::*;
use crate::process::{
    register_process, terminate_process_tree, unregister_process, wait_for_process,
};
use crate::temp::{cleanup_temp_files, ensure_temp_dir};
use crate::utils::{
    get_binary_path, parse_video_dimensions, CREATE_NEW_PROCESS_GROUP, CREATE_NO_WINDOW,
};
use crate::ytdlp::{build_ytdlp_command, monitor_ytdlp_progress};
use std::{
    path::Path,
    process::{Command, Stdio},
    thread,
    io::{BufReader, Write}
};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn terminate_process(queue_id: String) -> Result<(), String> {
    
    let process_info = unregister_process(&queue_id);

    if let Some(info) = process_info {
        if let Some(mut handle) = info.handle.lock().unwrap().take() {
            let pid = handle.child.id();

            if handle.is_ffmpeg {
                if let Some(mut stdin) = handle.child.stdin.take() {
                    let _ = stdin.write_all(b"q");
                    let _ = stdin.flush();
                    drop(stdin);

                    let queue_info = info.queue_info.lock().unwrap();
                    let queue_id_clone = queue_info.queue_id.clone();
                    thread::spawn(move || {
                        thread::sleep(std::time::Duration::from_millis(100));
                        if let Ok(None) = handle.child.try_wait() {
                            let _ = terminate_process_tree(pid);
                        }
                        let _ = cleanup_temp_files(&queue_id_clone);
                    });
                    return Ok(());
                }
            }

            let _ = terminate_process_tree(pid);
        }
        let queue_info = info.queue_info.lock().unwrap();
        let _ = cleanup_temp_files(&queue_info.queue_id);
    }

    Ok(())
}

#[tauri::command]
pub async fn save_video(
    app: AppHandle,
    operation: SaveOperation,
    queue_id: String,
) -> Result<(), String> {
    if PROCESSES.lock().unwrap().contains_key(&queue_id) {
        return Err("Process with this queue ID already exists".to_string());
    }

    let temp_dir = ensure_temp_dir()?;

    let output_ext = Path::new(&operation.output.path).extension()
        .and_then(|e| e.to_str()).unwrap();
    let temp_file = temp_dir.join(format!("{}.{}", queue_id, output_ext));
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
    let mut child = cmd.spawn()
        .map_err(|e| format!("FFmpeg error: {}", e))?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture stderr")?;

    let output_filename = Path::new(&operation.output.path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let child_arc = register_process(queue_id.clone(), child, true, output_filename);

    let reader = BufReader::new(stdout);
    monitor_ffmpeg_progress(
        reader, 
        queue_id.clone(), 
        app.clone(), 
        total_duration,
        operation.changes.trim.clone(),
    );

    let exit_status = wait_for_process(child_arc).await?;

    unregister_process(&queue_id);

    if !exit_status.success() {
        return Err("FFmpeg processing failed".to_string());
    }

    std::fs::rename(&temp_path, &operation.output.path)
        .map_err(|e| format!("Failed to move file to final destination: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn process_remote_video(
    app: AppHandle,
    operation: RemoteSaveOperation,
    queue_id: String,
) -> Result<(), String> {
    if PROCESSES.lock().unwrap().contains_key(&queue_id) {
        return Err("Process with this queue ID already exists".to_string());
    }

    let temp_dir = ensure_temp_dir()?;

    let output_ext = Path::new(&operation.output.path).extension()
        .and_then(|e| e.to_str()).unwrap_or("mp4");
    let temp_file = temp_dir.join(format!("{}.{}", queue_id, output_ext));
    let temp_path = temp_file.to_string_lossy().to_string();

    // Download with yt-dlp
    let mut ytdlp_cmd = build_ytdlp_command(
        &app,
        &operation.source.path,
        &temp_path,
        output_ext,
    );

    let mut child = ytdlp_cmd.spawn()
        .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    let output_filename = Path::new(&operation.output.path).file_name()
        .and_then(|n| n.to_str()).unwrap_or("unknown").to_string();

    let child_arc = register_process(queue_id.clone(), child, false, output_filename);

    let reader = BufReader::new(stdout);
    monitor_ytdlp_progress(reader, queue_id.clone(), app.clone());

    let download_exit_status = wait_for_process(child_arc).await?;
    unregister_process(&queue_id);

    if !download_exit_status.success() {
        return Err("Download failed or was cancelled".to_string());
    }

    // Get actual video dimensions
    let dimensions = get_video_dimensions(&app, &temp_path)?;

    // Adjust crop settings if needed
    let mut adjusted_changes = operation.changes.clone();
    if let Some(ref mut crop) = adjusted_changes.crop {
        adjust_crop_settings(
            crop,
            operation.source.width,
            operation.source.height,
            dimensions.0,
            dimensions.1,
        );
    }

    // If no post-processing needed, just move the file
    if adjusted_changes.crop.is_none() && adjusted_changes.compression.is_none() {
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
            width: dimensions.0,
            height: dimensions.1,
        },
        output: operation.output,
        changes: adjusted_changes,
    };

    process_with_ffmpeg(app, postprocess_operation, queue_id).await
}

async fn process_with_ffmpeg(
    app: AppHandle,
    operation: SaveOperation,
    queue_id: String,
) -> Result<(), String> {
    let total_duration = operation.source.duration;

    let output_filename = Path::new(&operation.output.path).file_name()
        .and_then(|n| n.to_str()).unwrap_or("unknown").to_string();

    let mut cmd = build_ffmpeg_command(&app, &operation);
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;
    let stdout = child.stdout.take()
        .ok_or("Failed to capture stdout")?;

    let child_arc = register_process(queue_id.clone(), child, true, output_filename);

    let reader = BufReader::new(stdout);
    monitor_ffmpeg_progress(
        reader, 
        queue_id.clone(), 
        app.clone(), 
        total_duration,
        operation.changes.trim.clone(),
    );

    let exit_status = wait_for_process(child_arc).await?;
    unregister_process(&queue_id);

    if !exit_status.success() {
        return Err("FFmpeg processing failed".to_string());
    }

    Ok(())
}

fn get_video_dimensions(app: &AppHandle, path: &str) -> Result<(u32, u32), String> {
    let output = Command::new(get_binary_path(app, "ffprobe"))
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .args([
            "-v", "quiet",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=s=x:p=0",
            path,
        ])
        .output().map_err(|e| format!("Failed to get video dimensions: {}", e))?;

    if !output.status.success() {
        return Err("FFprobe dimension query failed".to_string());
    }

    let dimensions_str = String::from_utf8_lossy(&output.stdout);
    parse_video_dimensions(dimensions_str.trim())
}

fn adjust_crop_settings(
    crop: &mut CropSettings,
    source_width: u32,
    source_height: u32,
    actual_width: u32,
    actual_height: u32,
) {
    if actual_width != source_width || actual_height != source_height {
        let width_scale = actual_width as f64 / source_width as f64;
        let height_scale = actual_height as f64 / source_height as f64;

        crop.width = ((crop.width as f64 * width_scale).round() as u32).max(2);
        crop.height = ((crop.height as f64 * height_scale).round() as u32).max(2);
        crop.x = ((crop.x as f64 * width_scale).round() as u32).min(actual_width - crop.width);
        crop.y =
            ((crop.y as f64 * height_scale).round() as u32).min(actual_height - crop.height);

        // Ensure even values for codec compatibility
        crop.width &= !1;
        crop.height &= !1;
        crop.x &= !1;
        crop.y &= !1;

        // Final boundary check
        if crop.x + crop.width > actual_width {
            crop.x = actual_width - crop.width;
        }
        if crop.y + crop.height > actual_height {
            crop.y = actual_height - crop.height;
        }
    }
}

#[tauri::command]
pub async fn get_video_info(app: AppHandle, path: String) -> Result<FFprobeOutput, String> {
    let output = Command::new(get_binary_path(&app, "ffprobe"))
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null())
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            &path,
        ])
        .output().map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&output_str)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))
}

#[tauri::command]
pub async fn get_streaming_url(
    app: AppHandle,
    url: String,
    format_preference: Option<String>,
) -> Result<YtVideoInfoWithUrl, String> {
    let ytdlp_path = get_binary_path(&app, "yt-dlp");
    let mut cmd = Command::new(ytdlp_path);
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .arg("--no-playlist");

    if let Some(format) = format_preference {
        cmd.args(["-f", &format]);
    } else {
        cmd.args(["-f", "b"]);
    }

    cmd.args(["-j", "--get-url", &url]);
    let output = cmd.output()
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let (urls, info) = {
        let output_str = String::from_utf8_lossy(&output.stdout);
        let mut lines: Vec<String> = output_str.lines().map(str::to_string).collect();
        let info_json = lines.pop().unwrap_or_else(|| "{}".to_string());
        let info = serde_json::from_str(&info_json).map_err(|e| e.to_string())?;
        (lines, info)
    };
    Ok(YtVideoInfoWithUrl{ urls, info })
}

#[tauri::command]
pub async fn search_youtube(app: AppHandle, query: String) -> Result<Vec<YtSearchResult>, String> {
    let ytdlp_path = get_binary_path(&app, "yt-dlp");
    
    let format_string = "%(title)s<=|>#<%(url)s<=|>#<%(uploader)s<=|>#<%(duration_string)s<=|>#<%(view_count)s<=|>#<%(id)s";
    
    let mut cmd = Command::new(ytdlp_path);
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .args([
            "--print", format_string,
            "--no-simulate",
            "--skip-download", 
            "--flat-playlist",
            "--ignore-errors",
            "--quiet",
            "--no-warnings",
            "--encoding", "utf-8",
            "--default-search", "ytsearch",
            &format!("ytsearch10:{}", query)
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    
    cmd.env("PYTHONIOENCODING", "utf-8")
       .env("LANG", "en_US.UTF-8")
       .env("LC_ALL", "en_US.UTF-8");
    
    let output = cmd.output()
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        return Ok(vec![]);
    }

    let output_str = String::from_utf8(output.stdout)
        .unwrap_or_else(|e| {
            eprintln!("UTF-8 parsing failed: {}", e);
            String::from_utf8_lossy(&e.into_bytes()).into_owned()
        });
    
    let mut results = Vec::new();
    
    for line in output_str.lines() {
        if line.trim().is_empty() {
            continue;
        }
        
        let parts: Vec<&str> = line.split("<=|>#<").collect();
        if parts.len() >= 6 {
            let result = YtSearchResult {
                title: parts[0].to_string(),
                url: parts[1].to_string(),
                uploader: if parts[2] != "NA" && !parts[2].is_empty() {
                    Some(parts[2].to_string())
                } else {
                    None
                },
                duration_string: if parts[3] != "NA" && !parts[3].is_empty() {
                    Some(parts[3].to_string())
                } else {
                    None
                },
                view_count: parts[4].parse::<u64>().ok(),
                id: if parts[5] != "NA" && !parts[5].is_empty() {
                    Some(parts[5].to_string())
                } else {
                    None
                },
            };
            
            if !result.url.is_empty() {
                results.push(result);
            }
        }
    }
    
    Ok(results)
}

#[tauri::command]
pub async fn check_ytdlp_version(app: AppHandle) -> Result<String, String> {
    let ytdlp_path = get_binary_path(&app, "yt-dlp");
    let output = Command::new(&ytdlp_path)
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn show_app_window(window: tauri::Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_queue_state() -> Vec<crate::process::QueueItemInfo> {
    crate::process::get_all_queue_items()
}

#[tauri::command]
pub fn update_window_title(app: AppHandle, title: String) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    window.set_title(&title).map_err(|e| e.to_string())?;
    Ok(())
}