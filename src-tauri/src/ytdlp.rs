use crate::models::QueueProgress;
use crate::utils::{create_command, get_binary_path};
use std::{
    io::{BufRead, BufReader},
    process::{Command, Stdio},
    thread,
};
use tauri::{AppHandle, Emitter};

pub fn parse_ytdlp_progress(line: &str) -> Option<(f64, Option<String>, Option<String>)> {
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

pub fn build_ytdlp_command(app: &AppHandle, url: &str, output_path: &str, ext: &str) -> Command {
    let ytdlp_path = get_binary_path(app, "yt-dlp").expect("Failed to get yt-dlp path");
    let ffmpeg_path = get_binary_path(app, "ffmpeg").expect("Failed to get ffmpeg path");

    let mut cmd = create_command(ytdlp_path);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .args([
            "-f",
            "bv*+ba/b",
            "-o",
            output_path,
            "--ffmpeg-location",
            &ffmpeg_path.to_string_lossy().to_string(),
            "--remux-video",
            ext,
            "--no-playlist",
            "--progress",
            "--newline",
            "--downloader",
            "aria2c",
            "--downloader-args",
            "aria2c:-c=false -x 16 -s 16 -j 2 -k 1M",
        ]);

    cmd.arg(url);
    cmd
}

pub fn monitor_ytdlp_progress(
    reader: BufReader<impl std::io::Read + Send + 'static>,
    queue_id: String,
    app: AppHandle,
) {
    thread::spawn(move || {
        for line in reader.lines().filter_map(Result::ok) {
            if let Some((progress, speed, eta)) = parse_ytdlp_progress(&line) {
                let queue_progress = QueueProgress {
                    queue_id: queue_id.clone(),
                    progress,
                    speed,
                    eta,
                    status: "downloading".to_string(),
                    current_size: None,
                    total_size: None,
                };

                // Update stored progress
                crate::process::update_queue_progress(&queue_id, &queue_progress);

                let _ = app.emit("queue-progress", queue_progress);
            }
        }
    });
}
