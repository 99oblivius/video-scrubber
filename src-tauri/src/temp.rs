use std::path::PathBuf;

pub fn get_temp_dir() -> PathBuf {
    std::env::temp_dir().join(".livideotmp")
}

pub fn ensure_temp_dir() -> Result<PathBuf, String> {
    let temp_dir = get_temp_dir();
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    Ok(temp_dir)
}

pub fn cleanup_temp_files(queue_id: &str) -> Result<(), String> {
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
            if file_name_str.contains(queue_id) {
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