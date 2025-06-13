use crate::models::QueueProgress;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::process::Child;
use std::sync::{Arc, Mutex};
use std::thread;
use crate::temp::cleanup_temp_files;

pub struct ProcessHandle {
    pub child: Child,
    pub is_ffmpeg: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct QueueItemInfo {
    pub queue_id: String,
    pub file_name: String,
    pub status: String,
    pub progress: f64,
    pub speed: Option<String>,
    pub eta: Option<String>,
}

pub struct ProcessInfo {
    pub handle: Arc<Mutex<Option<ProcessHandle>>>,
    pub queue_info: Arc<Mutex<QueueItemInfo>>,
}

pub static PROCESSES: Lazy<Mutex<HashMap<String, ProcessInfo>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub fn register_process(
    queue_id: String,
    child: Child,
    is_ffmpeg: bool,
    file_name: String,
) -> Arc<Mutex<Option<ProcessHandle>>> {
    let handle = Arc::new(Mutex::new(Some(ProcessHandle { child, is_ffmpeg })));
    let queue_info = Arc::new(Mutex::new(QueueItemInfo {
        queue_id: queue_id.clone(),
        file_name,
        status: "preparing".to_string(),
        progress: 0.0,
        speed: None,
        eta: None,
    }));
    
    let info = ProcessInfo {
        handle: handle.clone(),
        queue_info,
    };

    PROCESSES.lock().unwrap().insert(queue_id, info);
    handle
}

pub fn unregister_process(queue_id: &str) -> Option<ProcessInfo> {
    PROCESSES.lock().unwrap().remove(queue_id)
}

pub fn update_queue_progress(queue_id: &str, progress: &QueueProgress) {
    if let Some(info) = PROCESSES.lock().unwrap().get(queue_id) {
        let mut queue_info = info.queue_info.lock().unwrap();
        queue_info.progress = progress.progress;
        queue_info.status = progress.status.clone();
        queue_info.speed = progress.speed.clone();
        queue_info.eta = progress.eta.clone();
    }
}

pub fn get_all_queue_items() -> Vec<QueueItemInfo> {
    PROCESSES
        .lock()
        .unwrap()
        .values()
        .map(|info| info.queue_info.lock().unwrap().clone())
        .collect()
}

pub async fn wait_for_process(
    child_arc: Arc<Mutex<Option<ProcessHandle>>>,
) -> Result<std::process::ExitStatus, String> {
    loop {
        thread::sleep(std::time::Duration::from_millis(100));
        let mut child_lock = child_arc.lock().unwrap();
        if let Some(ref mut handle) = *child_lock {
            match handle.child.try_wait() {
                Ok(Some(status)) => return Ok(status),
                Ok(None) => continue,
                Err(e) => return Err(format!("Failed to wait for process: {}", e)),
            }
        } else {
            return Err("Process was terminated".to_string());
        }
    }
}

#[cfg(target_os = "windows")]
pub fn terminate_process_tree(pid: u32) -> Result<(), String> {
    use crate::utils::{CREATE_NO_WINDOW};
    use std::process::Command;
    use std::os::windows::process::CommandExt;

    Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to terminate process tree: {}", e))?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn terminate_process_tree(pid: u32) -> Result<(), String> {
    use std::process::Command;

    Command::new("pkill")
        .args(["-TERM", "-P", &pid.to_string()])
        .output()
        .map_err(|e| format!("Failed to terminate process tree: {}", e))?;
    Ok(())
}

pub fn terminate_process_with_cleanup(
    handle: &mut ProcessHandle,
    queue_id: &str,
) -> Result<(), String> {
    let pid = handle.child.id();
    
    if handle.is_ffmpeg {
        if let Some(mut stdin) = handle.child.stdin.take() {
            let _ = stdin.write_all(b"q");
            let _ = stdin.flush();
            drop(stdin);
            thread::sleep(std::time::Duration::from_millis(100));
            
            if let Ok(None) = handle.child.try_wait() {
                let queue_id_clone = queue_id.to_string();
                let _ = terminate_process_tree(pid);
                let _ = cleanup_temp_files(&queue_id_clone);
            } else {
                let _ = cleanup_temp_files(queue_id);
            }
            return Ok(());
        }
    }
    
    let _ = terminate_process_tree(pid);
    let _ = cleanup_temp_files(queue_id);
    Ok(())
}

pub fn terminate_all_processes() {
    let mut processes = PROCESSES.lock().unwrap();
    let process_ids: Vec<String> = processes.keys().cloned().collect();

    for queue_id in process_ids {
        if let Some(info) = processes.remove(&queue_id) {
            let mut process_opt = info.handle.lock().unwrap();
            if let Some(mut handle) = process_opt.take() {
                let queue_info = info.queue_info.lock().unwrap();
                let _ = terminate_process_with_cleanup(&mut handle, &queue_info.queue_id);
            } else {
                let queue_info = info.queue_info.lock().unwrap();
                let _ = cleanup_temp_files(&queue_info.queue_id);
            }
        }
    }
}