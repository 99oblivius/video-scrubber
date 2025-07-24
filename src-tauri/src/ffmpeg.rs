use crate::models::{QueueProgress, SaveOperation, TrimSettings};
use crate::utils::{create_command, get_binary_path};
use std::{
    io::{BufRead, BufReader},
    process::{Command, Stdio},
    thread,
    time::Instant,
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
    let ffmpeg_path = get_binary_path(app, "ffmpeg").expect("Failed to get ffmpeg path");
    let mut cmd = create_command(ffmpeg_path);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .args([
            "-y",
            "-loglevel",
            "error",
            "-progress",
            "pipe:1",
            "-i",
            &operation.source.path,
        ]);

    if let Some(trim) = &operation.changes.trim {
        cmd.arg("-ss").arg(trim.start_time.to_string());
        cmd.arg("-to").arg(trim.end_time.to_string());
    }

    if let Some(compression) = &operation.changes.compression {
        let video_codec = get_video_codec_param(&compression.video_codec);
        let audio_codec = get_audio_codec_param(&compression.audio_codec);
        cmd.args([
            "-c:v",
            video_codec,
            "-c:a",
            audio_codec,
            "-crf",
            &compression.quality.to_string(),
        ]);
    } else {
        cmd.args(["-c", "copy"]);
    }

    if let Some(crop) = &operation.changes.crop {
        let filter = format!("crop={}:{}:{}:{}", crop.width, crop.height, crop.x, crop.y);
        cmd.arg("-vf").arg(filter);
    }

    cmd.arg("-y").arg(&operation.output.path);
    cmd
}

pub fn monitor_ffmpeg_progress(
    reader: BufReader<impl std::io::Read + Send + 'static>,
    queue_id: String,
    app: AppHandle,
    total_duration: f64,
    trim_settings: Option<TrimSettings>,
) {
    thread::spawn(move || {
        let start_time = Instant::now();

        let actual_duration = if let Some(trim) = &trim_settings {
            trim.end_time - trim.start_time
        } else {
            total_duration
        };

        for line in reader.lines().filter_map(Result::ok) {
            if let Some(time_us) = parse_ffmpeg_time(&line) {
                let current_time = time_us as f64 / 1_000_000.0;

                let progress = if let Some(_trim) = &trim_settings {
                    ((current_time) / actual_duration) * 100.0
                } else {
                    (current_time / actual_duration) * 100.0
                };

                let progress = progress.clamp(0.0, 100.0);

                let elapsed = start_time.elapsed().as_secs_f64();

                let speed = if elapsed > 0.0 && actual_duration > 0.0 {
                    format!("{:.1}x", (current_time / elapsed))
                } else {
                    String::new()
                };

                let eta = if progress > 0.0 && progress < 100.0 && elapsed > 0.0 {
                    let rate = progress / elapsed;
                    let remaining_progress = 100.0 - progress;
                    let eta_seconds = (remaining_progress / rate) as u64;

                    format_duration(eta_seconds)
                } else {
                    String::new()
                };

                let queue_progress = QueueProgress {
                    queue_id: queue_id.clone(),
                    progress,
                    speed: Some(speed),
                    eta: Some(eta),
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

fn parse_ffmpeg_time(line: &str) -> Option<i64> {
    if line.starts_with("out_time_us=") {
        let time_str = &line[12..];
        if let Ok(time_us) = time_str.trim().parse::<i64>() {
            return Some(time_us);
        }
    }
    None
}

fn format_duration(seconds: u64) -> String {
    if seconds < 60 {
        format!("{}s", seconds)
    } else if seconds < 3600 {
        format!("{}m {}s", seconds / 60, seconds % 60)
    } else {
        format!("{}h {}m", seconds / 3600, (seconds % 3600) / 60)
    }
}
