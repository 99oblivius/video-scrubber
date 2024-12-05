const { invoke } = window.__TAURI__.core;

export const setupMetadata = (video) => {
    const $ = document.querySelector.bind(document);
    let frameTime = 1/30;
    let detectedFPS = null;

    const parseFrameRate = (rateStr) => {
        console.log(rateStr);
        const [num, den] = rateStr.split('/').map(Number);
        return num / (den || 1);
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    const formatDuration = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    const getVideoCodec = (videoFile) => {
        const fileName = videoFile.name.toLowerCase();
        if (fileName.includes('h264') || fileName.includes('avc')) return 'H.264';
        if (fileName.includes('h265') || fileName.includes('hevc')) return 'H.265';
        if (fileName.includes('av1')) return 'AV1';
        if (fileName.includes('vp8')) return 'VP8';
        if (fileName.includes('vp9')) return 'VP9';
        
        const type = videoFile.type;
        if (type.includes('mp4') || type.includes('h264')) return 'H.264';
        if (type.includes('webm')) return 'VP8/VP9';
        return '?';
    };
    
    const getAudioCodec = (videoFile) => {
        const fileName = videoFile.name.toLowerCase();
        if (fileName.includes('aac')) return 'AAC';
        if (fileName.includes('mp3')) return 'MP3';
        if (fileName.includes('opus')) return 'Opus';
        if (fileName.includes('vorbis')) return 'Vorbis';
        
        const type = videoFile.type;
        if (type.includes('mp4')) return 'AAC';
        if (type.includes('webm')) return 'Vorbis';
        return '?';
    };

    const detectFrameRate = async (videoPath) => {
        try {
            console.log(videoPath);
            const probeData = await invoke('get_video_info', { path: videoPath });
            
            const videoStream = probeData.streams.find(stream => 
                stream.codec_type.toLowerCase() === 'video'
            );

            if (!videoStream) throw new Error('No video stream found');
            const fps = parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate);
            
            if (fps > 0) {
                detectedFPS = fps;
                frameTime = 1 / fps;
                return fps;
            }
            throw new Error('Invalid frame rate detected');
        } catch (error) {
            console.warn('Failed to detect framerate:', error);
            // Fall back to default values
            detectedFPS = 30;
            frameTime = 1/30;
            return 30;
        }
    };

    const getFrameTime = () => frameTime;
    const getFPS = () => detectedFPS;

    const updateMetadataDisplay = async (file) => {
        if (!video.src) return;

        await detectFrameRate(file.path);
        
        const timeDisplay = $('.time-display');
        timeDisplay.innerHTML = `
            <div class="time-info">
                Time: <span id="timeDisplay">0.000</span>
                Frame: <span id="frameDisplay">0</span>
            </div>
            <div class="metadata-group">
                <div class="metadata-item">
                    <span class="metadata-label">⏱</span>
                    <span id="durationDisplay">${formatDuration(video.duration)}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">📐</span>
                    <span id="resolutionDisplay">${video.videoWidth}×${video.videoHeight}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">💾</span>
                    <span id="sizeDisplay">${formatFileSize(file.size)}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">🎬</span>
                    <span id="videoCodecDisplay">${getVideoCodec(file)}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">🔊</span>
                    <span id="audioCodecDisplay">${getAudioCodec(file)}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">🎯</span>
                    <span id="fpsDisplay">${1 * detectedFPS?.toFixed(3) || '30'} FPS</span>
                </div>
            </div>
        `;
    };

    const setupClickDrag = () => {
        const slider = document.querySelector('.time-display');
        let isDown = false;
        let startX;
        let scrollLeft;

        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.classList.add('active');
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
        });

        document.addEventListener('mouseup', () => {
            if (!isDown) return;
            isDown = false;
            slider.classList.remove('active');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX);
            slider.scrollLeft = scrollLeft - walk * 0.667;
        });
    };

    const init = () => {
        setupClickDrag();
    };

    return {
        init,
        getFrameTime,
        getFPS,
        detectFrameRate,
        updateMetadataDisplay,
    };
};