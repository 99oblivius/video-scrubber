#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::models::{QueueProgress, SaveOperation};
use crate::utils::{get_binary_path, CREATE_NEW_PROCESS_GROUP, CREATE_NO_WINDOW};
use std::{
    thread,
    process::{Command, Stdio},
    io::{BufRead, BufReader}
};
use tauri::{AppHandle, Emitter};

pub fn get_video_codec_param(codec: &str) -> &'static str {
    match codec {
        "h264" => "libx264",
        "h265" => "libx265",
        "av1" => "libaom-av1",
        "vp8" => "libvpx",
        "vp9" => "libvpx-vp9",
        _ => "libx264",
    }
}

pub fn get_audio_codec_param(codec: &str) -> &'static str {
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

pub fn build_ffmpeg_command(app: &AppHandle, operation: &SaveOperation) -> Command {
    let mut cmd = Command::new(get_binary_path(app, "ffmpeg"));
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .arg("-progress")
        .arg("pipe:1")
        .arg("-nostats")
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
        let filter = format!(
            "crop={}:{}:{}:{}",
            crop.width, crop.height, crop.x, crop.y
        );
        cmd.arg("-vf").arg(filter);
    }

    cmd.arg("-y").arg(&operation.output.path);
    cmd
}

pub fn parse_ffmpeg_progress(line: &str, total_duration: f64) -> Option<f64> {
    if line.starts_with("out_time_ms=") {
        let time_str = &line[12..];
        if let Ok(time_ms) = time_str.trim().parse::<i64>() {
            let current_time = time_ms as f64 / 1_000_000.0;
            return Some((current_time / total_duration) * 100.0);
        }
    }
    None
}

pub fn monitor_ffmpeg_progress(
    reader: BufReader<impl std::io::Read + Send + 'static>,
    queue_id: String,
    app: AppHandle,
    total_duration: f64,
) {
    thread::spawn(move || {
        for line in reader.lines().filter_map(Result::ok) {
            if let Some(progress) = parse_ffmpeg_progress(&line, total_duration) {
                let queue_progress = QueueProgress {
                    queue_id: queue_id.clone(),
                    progress,
                    speed: None,
                    eta: None,
                    status: "processing".to_string(),
                    current_size: None,
                    total_size: None,
                };
                
                crate::process::update_queue_progress(&queue_id, &queue_progress);
                
                let _ = app.emit("queue-progress", queue_progress);
            }
        }
    });
}