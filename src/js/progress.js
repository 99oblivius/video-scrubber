export const setupProgressBar = (video, metadata) => {
    const $ = document.querySelector.bind(document);
    const progressFill = $('#progressFill');
    const progressHandle = $('#progressHandle');
    const progressContainer = $('#progressContainer');
    const progressHoverTime = $('#progressHoverTime');
    let updateInterval = null;

    const updateProgress = () => {
        if (video.duration) {
            const progress = (video.currentTime / video.duration) * 100;
            progressFill.style.width = `${progress}%`;
            progressHandle.style.left = `${progress}%`;
        }
    };

    const updateTimeDisplay = () => {
        const timeDisplay = $('#timeDisplay');
        const frameDisplay = $('#frameDisplay');
        
        if (timeDisplay && frameDisplay) {
            const frameTime = metadata.getFrameTime();
            const frameNumber = Math.round(video.currentTime / frameTime);
            const frameAlignedTime = frameNumber * frameTime;
            
            timeDisplay.textContent = frameAlignedTime.toFixed(3) + 's';
            frameDisplay.textContent = frameNumber;
        }
        updateProgress();
    };

    const startUpdates = () => {
        stopUpdates();
        const fps = metadata.getFPS() || 30;
        const intervalTime = 1000 / fps;
        updateInterval = setInterval(updateTimeDisplay, intervalTime);
    };

    const stopUpdates = () => {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
    };

    const setProgress = (e) => {
        if (!video.duration) return;
        
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const targetTime = video.duration * Math.max(0, Math.min(1, pos));
        
        if (window.currentFile?.isStream) {
            let loadingIndicator = $('#scrubbing-indicator');
            if (!loadingIndicator) {
                loadingIndicator = document.createElement('div');
                loadingIndicator.id = 'scrubbing-indicator';
                loadingIndicator.className = 'scrubbing-indicator';
                document.body.appendChild(loadingIndicator);
            }
            
            loadingIndicator.style.display = 'block';
            
            const hideScrubbing = () => {
                loadingIndicator.style.display = 'none';
                video.removeEventListener('seeked', hideScrubbing);
            };
            
            video.addEventListener('seeked', hideScrubbing);
        }
        
        video.currentTime = targetTime;
    };

    const showHoverTime = (e) => {
        if (!video.duration) return;
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const time = video.duration * Math.max(0, Math.min(1, pos));
        const frame = Math.floor(time / metadata.getFrameTime());

        progressHoverTime.textContent = `${time.toFixed(3)}s (Frame ${frame})`;
        progressHoverTime.style.opacity = '1';

        const tooltipWidth = progressHoverTime.offsetWidth;
        
        let x = e.clientX;
        const minX = tooltipWidth / 2;
        const maxX = window.innerWidth - tooltipWidth / 2;
        x = Math.max(minX, Math.min(maxX, x));
        
        progressHoverTime.style.left = `${x}px`;
        progressHoverTime.style.top = `${rect.y - 35}px`;
    };

    const init = () => {
        progressContainer.addEventListener('mousemove', (e) => {
            if (e.buttons === 0) {
                showHoverTime(e);
            }
        });

        progressContainer.addEventListener('mouseleave', (e) => {
            if (e.buttons === 0) {
                progressHoverTime.style.opacity = '0';
            }
        });

        progressContainer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            setProgress(e);
            showHoverTime(e);

            const handleDrag = (e) => {
                setProgress(e);
                showHoverTime(e);
            };

            const handleDragEnd = () => {
                document.removeEventListener('mousemove', handleDrag);
                document.removeEventListener('mouseup', handleDragEnd);
                progressHoverTime.style.opacity = '0';
            };

            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', handleDragEnd);
        });

        video.addEventListener('play', startUpdates);
        video.addEventListener('pause', stopUpdates);
        video.addEventListener('seeking', updateTimeDisplay);
        video.addEventListener('seeked', updateTimeDisplay);
        
        video.addEventListener('loadedmetadata', () => {
            updateTimeDisplay();
            if (!video.paused) {
                startUpdates();
            }
        });

        video.addEventListener('videoFileLoaded', () => {
            stopUpdates();
            updateTimeDisplay();
            if (!video.paused) {
                startUpdates();
            }
        });

        video.addEventListener('error', (e) => {
        if (currentFile?.isStream) {
            const errorCode = video.error ? video.error.code : 'unknown';
            let errorMessage = 'Video playback error';
            
            switch (errorCode) {
                case 2: // MEDIA_ERR_NETWORK
                    errorMessage = 'Network error occurred while loading the video';
                    break;
                case 3: // MEDIA_ERR_DECODE
                    errorMessage = 'Error decoding the video stream';
                    break;
                case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                    errorMessage = 'This video format is not supported';
                    break;
                default:
                    errorMessage = `Video playback error (code: ${errorCode})`;
            }
            
            showError(errorMessage);
            console.error('Video error:', errorMessage, video.error);
        }
    });
        
        window.addEventListener('unload', stopUpdates);
        updateTimeDisplay();
    };

    return {
        init,
        updateTimeDisplay,
        updateProgress,
        startUpdates,
        stopUpdates
    };
};