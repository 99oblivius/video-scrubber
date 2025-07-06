use crate::models::{BinaryInfo, BinaryUpdateProgress};
use crate::utils::{create_command, get_binary_path};
use regex::Regex;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{BufRead, Read},
    path::Path,
};
use tauri::{AppHandle, Emitter, Manager};
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
use walkdir::WalkDir;

const YTDLP_HASH_URL: &str =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS";
#[cfg(target_os = "windows")]

const YTDLP_WINDOWS_BINARY_URL: &str =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const YTDLP_LINUX_X86_BINARY_URL: &str =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
const YTDLP_LINUX_ARCH_BINARY_URL: &str =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64";
#[cfg(target_os = "macos")]
const YTDLP_MACOS_BINARY_URL: &str =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";

const FFMPEG_VERSION_URL: &str = "https://www.gyan.dev/ffmpeg/builds/release-version";

#[cfg(target_os = "windows")]
const FFMPEG_WINDOWS_BINARY_URL: &str =
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
#[cfg(target_os = "macos")]
const FFMPEG_MACOS_BINARY_URL: &str = "https://evermeet.cx/ffmpeg/getrelease/ffmpeg";
#[cfg(target_os = "macos")]
const FFPROBE_MACOS_BINARY_URL: &str = "https://evermeet.cx/ffmpeg/getrelease/ffprobe";
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const FFMPEG_LINUX_BINARY_URL: &str =
    "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz";

pub async fn check_binary_status(app: &AppHandle, binary_name: &str) -> Result<BinaryInfo, String> {
    let binary_path = get_binary_path(app, binary_name)
        .map_err(|e| format!("Failed to get binary path: {}", e))?;

    if !binary_path.exists() {
        return Ok(BinaryInfo {
            name: binary_name.to_string(),
            current_version: None,
            latest_version: None,
            needs_update: true,
            is_installed: false,
        });
    }

    if binary_name == "yt-dlp" {
        let platform_filename = get_ytdlp_filename();
        let hash_map = fetch_yt_dlp_hashes().await?;
        let latest_hash = hash_map
            .get(platform_filename)
            .ok_or_else(|| format!("No hash found for {}", platform_filename))?;

        let local_hash = compute_sha256(&binary_path)?;
        let needs_update = !local_hash.eq_ignore_ascii_case(latest_hash);

        return Ok(BinaryInfo {
            name: binary_name.to_string(),
            current_version: Some(local_hash),
            latest_version: Some(latest_hash.clone()),
            needs_update,
            is_installed: true,
        });
    }

    let current_version = get_installed_version(app, binary_name).await?;
    let latest_version = get_latest_version(binary_name).await?;

    let needs_update = match (&current_version, &latest_version) {
        (Some(current), Some(latest)) => !versions_match(current, latest),
        _ => true,
    };

    Ok(BinaryInfo {
        name: binary_name.to_string(),
        current_version,
        latest_version,
        needs_update,
        is_installed: true,
    })
}

async fn get_installed_version(
    app: &AppHandle,
    binary_name: &str,
) -> Result<Option<String>, String> {
    let binary_path = get_binary_path(app, binary_name)
        .map_err(|e| format!("Failed to get binary path: {}", e))?;

    if !binary_path.exists() {
        return Ok(None);
    }

    let version_flag = match binary_name {
        "yt-dlp" => "--version",
        "ffmpeg" | "ffprobe" => "-version",
        _ => return Err(format!("Unknown binary: {}", binary_name)),
    };

    let output = create_command(binary_path)
        .arg(version_flag)
        .output()
        .map_err(|e| format!("Failed to check version: {}", e))?;

    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    match binary_name {
        "yt-dlp" => Ok(Some(stdout.trim().to_string())),
        "ffmpeg" | "ffprobe" => {
            let re = Regex::new(r"ffmpeg version ([0-9]+(?:\.[0-9]+)*)").unwrap();
            Ok(re
                .captures(&stdout)
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().to_string()))
        }
        _ => Ok(None),
    }
}

async fn get_latest_version(binary_name: &str) -> Result<Option<String>, String> {
    match binary_name {
        "ffmpeg" | "ffprobe" => {
            let response = reqwest::get(FFMPEG_VERSION_URL)
                .await
                .map_err(|e| format!("Failed to fetch latest version: {}", e))?;

            let version = response
                .text()
                .await
                .map_err(|e| format!("Failed to read version response: {}", e))?;

            Ok(Some(version.trim().to_string()))
        }
        "yt-dlp" => Ok(None),
        _ => Err(format!("Unknown binary: {}", binary_name)),
    }
}

fn versions_match(current: &str, latest: &str) -> bool {
    current == latest
}

pub async fn update_ytdlp(app: &AppHandle) -> Result<(), String> {
    let ytdlp_path =
        get_binary_path(app, "yt-dlp").map_err(|e| format!("Failed to get path: {}", e))?;
    let platform_filename = get_ytdlp_filename();
    let download_url = get_ytdlp_download_url()?;

    if !ytdlp_path.exists() {
        emit_progress(app, "yt-dlp", 5.0, "downloading", Some("Downloading..."));

        let temp_dir = crate::temp::ensure_temp_dir()?;
        let temp_path = temp_dir.join(platform_filename);

        // Download with progress tracking
        download_file_with_progress(&download_url, &temp_path, app, "yt-dlp", 5.0, 90.0).await?;

        std::fs::copy(&temp_path, &ytdlp_path).map_err(|e| format!("Failed to install: {}", e))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&ytdlp_path)
                .expect("File permissions not found")
                .permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&ytdlp_path, perms)
                .expect("File permissions could not be set");
        }

        emit_progress(app, "yt-dlp", 100.0, "complete", Some("Success"));
        return Ok(());
    }

    emit_progress(app, "yt-dlp", 10.0, "updating", Some("Updating..."));

    let mut cmd = create_command(ytdlp_path.clone());
    cmd.arg("-U")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        emit_progress(
            app,
            "yt-dlp",
            100.0,
            "error",
            Some("Failed to start update"),
        );
        format!("Failed to start update: {}", e)
    })?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let reader = std::io::BufReader::new(stdout);

    for line in reader.lines() {
        let line = line.unwrap_or_default();
        if line.contains("Current version:") {
            emit_progress(app, "yt-dlp", 20.0, "updating", Some(&line));
        } else if line.contains("Latest version:") {
            emit_progress(app, "yt-dlp", 40.0, "updating", Some(&line));
        } else if line.contains("Current Build Hash:") {
            emit_progress(app, "yt-dlp", 60.0, "updating", Some(&line));
        } else if line.contains("Updating to") {
            emit_progress(app, "yt-dlp", 80.0, "updating", Some(&line));
        } else if line.contains("Updated yt-dlp to") {
            emit_progress(app, "yt-dlp", 100.0, "complete", Some(&line));
        }
    }

    let status = child.wait().map_err(|e| {
        emit_progress(app, "yt-dlp", 100.0, "error", Some("Update process failed"));
        format!("Failed to wait for update: {}", e)
    })?;

    if !status.success() {
        emit_progress(app, "yt-dlp", 100.0, "error", Some("Update failed"));
        return Err("Update failed".to_string());
    }

    Ok(())
}

fn get_ytdlp_filename() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "yt-dlp.exe"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "yt-dlp_linux"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "yt-dlp_linux_aarch64"
    }
    #[cfg(target_os = "macos")]
    {
        "yt-dlp_macos"
    }
    #[cfg(not(any(
        target_os = "windows",
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        target_os = "macos"
    )))]
    {
        "yt-dlp"
    }
}

fn compute_sha256(path: &Path) -> Result<String, String> {
    let mut file =
        fs::File::open(path).map_err(|e| format!("Failed to open file for hashing: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("Failed to read file for hashing: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

async fn fetch_yt_dlp_hashes() -> Result<std::collections::HashMap<String, String>, String> {
    let response = reqwest::get(YTDLP_HASH_URL)
        .await
        .map_err(|e| format!("Failed to fetch hashes: {}", e))?;
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read hash file: {}", e))?;

    let mut map = std::collections::HashMap::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split_whitespace();
        if let (Some(hash), Some(filename)) = (parts.next(), parts.next()) {
            map.insert(filename.to_string(), hash.to_string());
        }
    }
    Ok(map)
}

pub async fn update_ffmpeg(app: &AppHandle) -> Result<(), String> {
    emit_progress(app, "ffmpeg", 0.0, "downloading", Some("Downloading..."));

    match download_ffmpeg(app).await {
        Ok(()) => {
            emit_progress(app, "ffmpeg", 100.0, "complete", Some("Success"));
            Ok(())
        }
        Err(e) => {
            emit_progress(
                app,
                "ffmpeg",
                100.0,
                "error",
                Some(&format!("Update failed: {}", e)),
            );
            Err(format!("Update failed: {}", e))
        }
    }
}

fn get_ytdlp_download_url() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(YTDLP_WINDOWS_BINARY_URL.to_string())
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        Ok(YTDLP_LINUX_X86_BINARY_URL.to_string())
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        Ok(YTDLP_LINUX_ARCH_BINARY_URL.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        Ok(YTDLP_MACOS_BINARY_URL.to_string())
    }
    #[cfg(not(any(
        target_os = "windows",
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        target_os = "macos"
    )))]
    {
        Err("Unsupported platform".to_string())
    }
}

async fn download_file_with_progress(
    url: &str,
    path: &Path,
    app: &AppHandle,
    binary_name: &str,
    start_progress: f64,
    end_progress: f64,
) -> Result<(), String> {
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded = 0u64;
    let mut file = fs::File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = response.bytes_stream();
    use futures::StreamExt;
    use std::io::Write;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {}", e))?;

        downloaded += chunk.len() as u64;
        if total_size > 0 {
            let progress = start_progress
                + (downloaded as f64 / total_size as f64) * (end_progress - start_progress);
            emit_progress(
                app,
                binary_name,
                progress,
                "downloading",
                Some(&format!("Downloading: {:.1}%", progress)),
            );
        }
    }

    Ok(())
}

pub async fn download_ffmpeg(app: &AppHandle) -> Result<(), String> {
    let temp_dir = crate::temp::ensure_temp_dir()?;
    let bin_dir = app
        .path()
        .app_local_data_dir()
        .expect("Local AppData dir missing")
        .join("resources")
        .join("bin");
    fs::create_dir_all(&bin_dir).map_err(|e| format!("Failed to create bin dir: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        let url = FFMPEG_WINDOWS_BINARY_URL;
        let archive_path = temp_dir.join("ffmpeg-release-essentials.zip");

        emit_progress(app, "ffmpeg", 5.0, "downloading", Some("Downloading..."));

        download_file_with_progress(url, &archive_path, app, "ffmpeg", 5.0, 70.0).await?;

        emit_progress(app, "ffmpeg", 75.0, "extracting", Some("Extracting..."));
        extract_ffmpeg_windows(&archive_path, &bin_dir)?;

        emit_progress(app, "ffmpeg", 90.0, "testing", Some("Testing..."));
        test_ffmpeg_binaries(&bin_dir)?;

        emit_progress(app, "ffmpeg", 100.0, "complete", Some("Success"));
    }

    #[cfg(target_os = "macos")]
    {
        let ffmpeg_url = FFMPEG_MACOS_BINARY_URL;
        let ffprobe_url = FFPROBE_MACOS_BINARY_URL;
        let ffmpeg_zip = temp_dir.join("ffmpeg-macos.zip");
        let ffprobe_zip = temp_dir.join("ffprobe-macos.zip");

        emit_progress(app, "ffmpeg", 5.0, "downloading", Some("Downloading..."));

        download_file_with_progress(ffmpeg_url, &ffmpeg_zip, app, "ffmpeg", 5.0, 35.0).await?;

        download_file_with_progress(ffprobe_url, &ffprobe_zip, app, "ffmpeg", 40.0, 70.0).await?;

        emit_progress(app, "ffmpeg", 75.0, "extracting", Some("Extracting..."));
        extract_single_binary_zip(&ffmpeg_zip, &bin_dir, "ffmpeg")?;
        extract_single_binary_zip(&ffprobe_zip, &bin_dir, "ffprobe")?;

        emit_progress(app, "ffmpeg", 90.0, "testing", Some("Testing..."));
        test_ffmpeg_binaries(&bin_dir)?;

        emit_progress(app, "ffmpeg", 100.0, "complete", Some("Success"));
    }

    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        let url = FFMPEG_LINUX_BINARY_URL;
        let archive_path = temp_dir.join("ffmpeg-release-amd64-static.tar.xz");

        emit_progress(app, "ffmpeg", 5.0, "downloading", Some("Downloading..."));

        download_file_with_progress(url, &archive_path, app, "ffmpeg", 5.0, 75.0).await?;

        emit_progress(app, "ffmpeg", 80.0, "extracting", Some("Extracting..."));
        extract_ffmpeg_linux(&archive_path, &bin_dir)?;

        emit_progress(app, "ffmpeg", 95.0, "testing", Some("Testing..."));
        test_ffmpeg_binaries(&bin_dir)?;

        emit_progress(app, "ffmpeg", 100.0, "complete", Some("Success"));
    }

    Ok(())
}

fn test_ffmpeg_binaries(bin_dir: &Path) -> Result<(), String> {
    let ffmpeg = bin_dir.join(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let ffprobe = bin_dir.join(if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    });

    let ffmpeg_ok = std::process::Command::new(&ffmpeg)
        .arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    let ffprobe_ok = std::process::Command::new(&ffprobe)
        .arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if !ffmpeg_ok || !ffprobe_ok {
        return Err("FFmpeg or ffprobe test failed after extraction".to_string());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn extract_ffmpeg_windows(archive_path: &Path, bin_dir: &Path) -> Result<(), String> {
    use zip::ZipArchive;
    let file =
        fs::File::open(archive_path).map_err(|e| format!("Failed to open archive: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read archive: {}", e))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read entry: {}", e))?;
        let name = file.name().to_lowercase();
        if name.ends_with("ffmpeg.exe") || name.ends_with("ffprobe.exe") {
            let out_path = bin_dir.join(Path::new(file.name()).file_name().unwrap());
            let mut out_file = fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create output file: {}", e))?;
            std::io::copy(&mut file, &mut out_file)
                .map_err(|e| format!("Failed to extract file: {}", e))?;
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn extract_single_binary_zip(
    zip_path: &Path,
    bin_dir: &Path,
    target_name: &str,
) -> Result<(), String> {
    use zip::ZipArchive;
    let file = fs::File::open(zip_path).map_err(|e| format!("Failed to open zip: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;
    if archive.len() != 1 {
        return Err("Expected zip to contain exactly one file".to_string());
    }
    let mut file = archive
        .by_index(0)
        .map_err(|e| format!("Failed to read entry: {}", e))?;
    let out_path = bin_dir.join(target_name);
    let mut out_file =
        fs::File::create(&out_path).map_err(|e| format!("Failed to create output file: {}", e))?;
    std::io::copy(&mut file, &mut out_file)
        .map_err(|e| format!("Failed to extract file: {}", e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&out_path)
            .expect("File permissions not found")
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&out_path, perms).expect("File persmissions could not be set");
    }
    Ok(())
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn extract_ffmpeg_linux(archive_path: &Path, bin_dir: &Path) -> Result<(), String> {
    use std::process::Command;
    let temp_extract = bin_dir.join("ffmpeg-tmp-extract");
    fs::create_dir_all(&temp_extract).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    let output = Command::new("tar")
        .args(&[
            "-xf",
            archive_path.to_str().unwrap(),
            "-C",
            temp_extract.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Failed to extract archive: {}", e))?;
    if !output.status.success() {
        return Err("Failed to extract ffmpeg tar.xz".to_string());
    }
    for entry in WalkDir::new(&temp_extract) {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name == "ffmpeg" || name == "ffprobe" {
            let dest = bin_dir.join(&name);
            fs::rename(entry.path(), &dest).map_err(|e| format!("Failed to move binary: {}", e))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = fs::metadata(&dest)
                    .expect("File permissions not found")
                    .permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&dest, perms).expect("File permissions could not be set");
            }
        }
    }
    let _ = fs::remove_dir_all(&temp_extract);
    Ok(())
}

fn emit_progress(
    app: &AppHandle,
    binary_name: &str,
    progress: f64,
    status: &str,
    message: Option<&str>,
) {
    let update = BinaryUpdateProgress {
        binary_name: binary_name.to_string(),
        progress,
        status: status.to_string(),
        message: message.map(|s| s.to_string()),
    };
    let _ = app.emit("binary-update-progress", update);
}
