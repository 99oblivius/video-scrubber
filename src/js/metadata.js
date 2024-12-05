const { invoke } = window.__TAURI__.core;

export const setupMetadata = (video) => {
    const $ = document.querySelector.bind(document);
    let frameTime = 1/30;
    let detectedFPS = null;
    let probeData = null;

    const parseFrameRate = (rateStr) => {
        if (!rateStr) return null;
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

    const getVideoStream = () => {
        if (!probeData) return null;
        return probeData.streams.find(stream => 
            stream.codec_type.toLowerCase() === 'video'
        );
    };

    const getAudioStreams = () => {
        if (!probeData) return [];
        return probeData.streams.filter(stream => 
            stream.codec_type.toLowerCase() === 'audio'
        );
    };

    const fetchProbeData = async (videoPath) => {
        if (probeData) return probeData;
        
        try {
            probeData = await invoke('get_video_info', { path: videoPath });
            console.log(probeData);
            return probeData;
        } catch (error) {
            console.error('Failed to fetch probe data:', error);
            probeData = null;
            throw error;
        }
    };

    const getVideoCodec = () => {
        const videoStream = getVideoStream();
        if (!videoStream) return '?';
        let codecName = videoStream.codec_name;
        return codecName;
    };
    
    const getAudioCodec = () => {
        if (!probeData) return '?';
        const audioStreams = getAudioStreams();
        const primaryStream = audioStreams[0];
        let codecName = primaryStream.codec_name;
        return audioStreams.length > 1 ? `${codecName}(${audioStreams.length})` : codecName;
    };

    const detectFrameRate = () => {
        const videoStream = getVideoStream();
        if (!videoStream) {
            console.warn('No video stream found for frame rate detection');
            return 30;
        }

        const fps = parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate);
        
        if (fps > 0) {
            detectedFPS = fps;
            frameTime = 1 / fps;
            return fps;
        }

        console.warn('Invalid frame rate detected, using default');
        detectedFPS = 30;
        frameTime = 1/30;
        return 30;
    };

    const getFrameTime = () => frameTime;
    const getFPS = () => detectedFPS;

    const updateMetadataDisplay = async (file) => {
        if (!video.src) return;

        try {
            await fetchProbeData(file.path);
            
            const fps = detectFrameRate();
            const videoCodec = getVideoCodec();
            const audioCodec = getAudioCodec();
            
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
                        <span class="metadata-label">🎯</span>
                        <span id="fpsDisplay">${1*fps.toFixed(3)} FPS</span>
                    </div>
                    <div class="metadata-item">
                        <span class="metadata-label">🎬</span>
                        <span id="videoCodecDisplay">${videoCodec}</span>
                    </div>
                    <div class="metadata-item">
                        <span class="metadata-label">🔊</span>
                        <span id="audioCodecDisplay">${audioCodec}</span>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Failed to update metadata display:', error);
        }
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

    // Clear probe data when a new video is loaded
    video.addEventListener('loadstart', () => {
        probeData = null;
        detectedFPS = null;
        frameTime = 1/30;
    });

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