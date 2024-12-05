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
        if (updateInterval) return;
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
        video.currentTime = video.duration * Math.max(0, Math.min(1, pos));
    };
    
    const showHoverTime = (e) => {
        if (!video.duration) return;
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const time = video.duration * Math.max(0, Math.min(1, pos));
        const frame = Math.floor(time / metadata.getFrameTime());
        progressHoverTime.textContent = `${time.toFixed(3)}s (Frame ${frame})`;
        progressHoverTime.style.left = `${e.clientX}px`;
        progressHoverTime.style.top = `${rect.y - 35}px`;
        progressHoverTime.style.opacity = '1';
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
        
        window.addEventListener('unload', stopUpdates);

        updateTimeDisplay();
    };

    return {
        init,
        updateTimeDisplay,
        updateProgress
    };
};