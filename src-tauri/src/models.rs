use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub container: String,
    pub duration: f64,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteSourceInfo {
    pub path: String,
    pub name: String,
    pub is_stream: bool,
    pub streaming_url: Option<String>,
    pub width: u32,
    pub height: u32,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputInfo {
    pub path: String,
    pub container: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionSettings {
    pub video_codec: String,
    pub audio_codec: String,
    pub quality: i32,
    pub container: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrimSettings {
    pub start_time: f64,
    pub end_time: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CropSettings {
    pub width: u32,
    pub height: u32,
    pub x: u32,
    pub y: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Changes {
    pub compression: Option<CompressionSettings>,
    pub trim: Option<TrimSettings>,
    pub crop: Option<CropSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveOperation {
    pub source: SourceInfo,
    pub output: OutputInfo,
    pub changes: Changes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteSaveOperation {
    pub source: RemoteSourceInfo,
    pub output: OutputInfo,
    pub changes: Changes,
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
    pub title: String,
    pub formats: Option<Vec<Format>>,
    pub thumbnails: Option<Vec<Thumbnail>>,
    pub duration: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub ext: Option<String>,
    pub video_ext: Option<String>,
    pub audio_ext: Option<String>,
    pub format: Option<String>,
    pub format_id: Option<String>,
    pub format_note: Option<String>,
    pub tbr: Option<f64>,
    pub vbr: Option<f64>,
    pub abr: Option<f64>,
    pub filesize: Option<u64>,
    pub filesize_approx: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YtVideoInfoWithUrl {
    pub urls: Vec<String>,
    pub info: YtVideoInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Format {
    pub format_id: String,
    pub url: String,
    pub height: Option<u32>,
    pub width: Option<u32>,
    pub fps: Option<f64>,
    pub format_note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Thumbnail {
    pub url: String,
    pub height: Option<u32>,
    pub width: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct QueueProgress {
    pub queue_id: String,
    pub progress: f64,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub status: String,
    pub current_size: Option<u64>,
    pub total_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YtSearchResult {
    pub title: String,
    pub url: String,
    pub uploader: Option<String>,
    pub duration_string: Option<String>,
    pub view_count: Option<u64>,
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryInfo {
    pub name: String,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub needs_update: bool,
    pub is_installed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryUpdateProgress {
    pub binary_name: String,
    pub progress: f64,
    pub status: String,
    pub message: Option<String>,
}