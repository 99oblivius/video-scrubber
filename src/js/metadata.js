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
            printProbeData(probeData, videoPath);
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
        if (!probeData) return null;
        const audioStreams = getAudioStreams();
        if (audioStreams.length === 0) return null;
        
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
            
            const metadataItems = [`
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
                    </div>`];

            if (audioCodec !== null) {
                metadataItems.push(`
                    <div class="metadata-item">
                        <span class="metadata-label">🔊</span>
                        <span id="audioCodecDisplay">${audioCodec}</span>
                    </div>`);
            }

            metadataItems.push(`</div>`);
            
            timeDisplay.innerHTML = metadataItems.join('');
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

const printProbeData = (data, path) => {
    const styles = {
        header: 'color: #3B82F6; font-weight: bold; font-size: 13px;',
        subheader: 'color: #3B82F6; font-weight: bold;',
        label: 'color: #666;',
        value: 'color: #444;',
        path: 'color: #666;',
        filename: 'color: #3B82F6; font-weight: bold;'
    };

    const formatValue = (value) => value ?? 'N/A';
    const filename = path.split('/').pop().split('\\').pop();

    const printStream = (stream, index) => {
        const type = stream.codec_type.toLowerCase();
        const isVideo = type === 'video';
        
        const groupFn = isVideo ? console.group : console.groupCollapsed;
        groupFn.call(console, `%c${type.toUpperCase()} STREAM #${index}`, styles.subheader);

        console.group('%cCodec', styles.label);
        console.log(`%cName: %c${formatValue(stream.codec_name)}`, styles.label, styles.value);
        console.log(`%cFull Name: %c${formatValue(stream.codec_long_name)}`, styles.label, styles.value);
        console.log(`%cProfile: %c${formatValue(stream.profile)}`, styles.label, styles.value);
        if (stream.level) console.log(`%cLevel: %c${formatValue(stream.level)}`, styles.label, styles.value);
        console.groupEnd();

        if (type === 'video') {
            console.group('%cVideo', styles.label);
            console.log(`%cFPS (avg): %c${formatValue(stream.avg_frame_rate)}`, styles.label, styles.value);
            console.log(`%cFPS (base): %c${formatValue(stream.r_frame_rate)}`, styles.label, styles.value);
            if (stream.nb_frames) console.log(`%cFrames: %c${formatValue(stream.nb_frames)}`, styles.label, styles.value);
            console.groupEnd();
        }

        if (type === 'audio') {
            console.group('%cAudio', styles.label);
            if (stream.channels) console.log(`%cChannels: %c${formatValue(stream.channels)}`, styles.label, styles.value);
            if (stream.sample_rate) console.log(`%cSample Rate: %c${formatValue(stream.sample_rate)} Hz`, styles.label, styles.value);
            if (stream.bit_rate) console.log(`%cBit Rate: %c${formatValue(stream.bit_rate)} bps`, styles.label, styles.value);
            console.groupEnd();
        }

        const additionalProps = Object.entries(stream)
            .filter(([key]) => !['codec_type', 'codec_name', 'codec_long_name', 'profile', 'level', 
                             'avg_frame_rate', 'r_frame_rate', 'nb_frames', 'channels', 
                             'sample_rate', 'bit_rate'].includes(key))
            .filter(([_, value]) => value != null);

        if (additionalProps.length > 0) {
            console.group('%cOther', styles.label);
            additionalProps.forEach(([key, value]) => {
                console.log(`%c${key}: %c${formatValue(value)}`, styles.label, styles.value);
            });
            console.groupEnd();
        }
        console.groupEnd();
    };

    console.group(`%c${path.replace(filename, '')}%c${filename}`, styles.path, styles.filename);
    data.streams.forEach((stream, index) => printStream(stream, index));
    console.groupEnd();
};