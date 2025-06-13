use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const CREATE_NO_WINDOW: u32 = 0x08000000;
pub const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;

pub fn get_binary_path(app: &AppHandle, binary: &str) -> PathBuf {
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

pub fn parse_video_dimensions(dimensions_str: &str) -> Result<(u32, u32), String> {
    let parts: Vec<&str> = dimensions_str.trim().split('x').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid dimension format: {}", dimensions_str));
    }

    let width = parts[0]
        .parse()
        .map_err(|_| format!("Invalid width: {}", parts[0]))?;
    let height = parts[1]
        .parse()
        .map_err(|_| format!("Invalid height: {}", parts[1]))?;

    Ok((width, height))
}

pub fn format_time(seconds: f64) -> String {
    let hours = (seconds / 3600.0) as u32;
    let minutes = ((seconds % 3600.0) / 60.0) as u32;
    let secs = (seconds % 60.0) as u32;
    let ms = ((seconds % 1.0) * 1000.0) as u32;
    format!("{:02}:{:02}:{:02}.{:03}", hours, minutes, secs, ms)
}