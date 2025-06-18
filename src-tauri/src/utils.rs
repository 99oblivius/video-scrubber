use std::{
    fs,
    path::PathBuf,
    process::Command,
};
use tauri::{AppHandle, Manager};

pub fn create_command(binary_path: PathBuf) -> Command {
    let mut cmd = Command::new(binary_path);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    cmd
}

pub fn get_binary_path(app: &AppHandle, binary: &str) -> Result<PathBuf, std::io::Error> {
    let bin_name = if cfg!(windows) {
        format!("{}.exe", binary)
    } else {
        binary.to_string()
    };

    let path = app
        .path()
        .resource_dir()
        .expect("Failed to get resource dir")
        .join("resources")
        .join("bin");

    fs::create_dir_all(&path)?;

    Ok(path.join(bin_name))
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
