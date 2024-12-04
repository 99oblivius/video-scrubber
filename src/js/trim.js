export const setupTrim = (video, metadata) => {
    const $ = document.querySelector.bind(document);
    const trimBtn = $('#trim-button');
    const progressContainer = $('#progressContainer');
    const progressBar = $('.progress-bar');
    
    let trimStart = 0;
    let trimEnd = video.duration || 0;
    let animationFrameId = null;
    
    // Create trim handles
    const createTrimHandles = () => {
        const leftHandle = document.createElement('div');
        leftHandle.className = 'trim-handle left-handle';
        leftHandle.style.display = 'none';
        
        const rightHandle = document.createElement('div');
        rightHandle.className = 'trim-handle right-handle';
        rightHandle.style.display = 'none';
        
        const trimRegion = document.createElement('div');
        trimRegion.className = 'trim-region';
        trimRegion.style.display = 'none';
        
        progressBar.appendChild(leftHandle);
        progressBar.appendChild(rightHandle);
        progressBar.appendChild(trimRegion);
        
        return { leftHandle, rightHandle, trimRegion };
    };
    
    const { leftHandle, rightHandle, trimRegion } = createTrimHandles();
    const progressHoverTime = $('#progressHoverTime');
    
    const updateProgressHoverTime = (time, x) => {
        const frame = Math.floor(time / metadata.frameTime);
        progressHoverTime.textContent = `${time.toFixed(3)}s (Frame ${frame})`;
        progressHoverTime.style.left = `${x}px`;
        progressHoverTime.style.opacity = '1';
    };
    
    const updateTrimRegion = () => {
        const duration = video.duration || 0;
        const leftPos = (trimStart / duration) * 100;
        const rightPos = (trimEnd / duration) * 100;
        
        leftHandle.style.left = `${leftPos}%`;
        rightHandle.style.left = `${rightPos}%`;
        trimRegion.style.left = `${leftPos}%`;
        trimRegion.style.width = `${rightPos - leftPos}%`;
        
        // Store values in window for save.js to access
        window.trimStart = trimStart;
        window.trimEnd = trimEnd;
    };
    
    const setupHandleDrag = (handle, isLeft) => {
        let isDragging = false;
        let originalTime;
        let wasPlaying;
        
        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            e.stopPropagation();
            originalTime = video.currentTime;
            wasPlaying = !video.paused;
            if (wasPlaying) video.pause();
            
            const handleDrag = (e) => {
                if (!isDragging) return;
                
                const rect = progressBar.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                const time = video.duration * Math.max(0, Math.min(1, pos));
                
                if (isLeft) {
                    trimStart = Math.min(time, trimEnd - 0.1);
                    video.currentTime = trimStart;
                } else {
                    trimEnd = Math.max(time, trimStart + 0.1);
                    video.currentTime = trimEnd;
                }
                
                updateTrimRegion();
                updateProgressHoverTime(video.currentTime, e.clientX);
            };
            
            const stopDrag = () => {
                isDragging = false;
                video.currentTime = originalTime;
                if (wasPlaying) video.play();
                progressHoverTime.style.opacity = '0';
                document.removeEventListener('mousemove', handleDrag);
                document.removeEventListener('mouseup', stopDrag);
            };
            
            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', stopDrag);
        });
    };
    
    const toggleTrimMode = () => {
        const isActive = trimBtn.classList.toggle('active');
        
        leftHandle.style.display = isActive ? 'block' : 'none';
        rightHandle.style.display = isActive ? 'block' : 'none';
        trimRegion.style.display = isActive ? 'block' : 'none';
        
        if (isActive) {
            // Only reset positions if no previous trim exists
            if (window.trimStart === undefined || window.trimEnd === undefined) {
                trimStart = 0;
                trimEnd = video.duration || 0;
            }
            updateTrimRegion();
        } else {
            // Don't reset the values, just hide the UI
            // but keep window.trimStart/End for save.js
        }
    };
    
    let isUserSeeking = false;
    let wasPlaying = false;

    const handleSeekStart = () => {
        isUserSeeking = true;
        wasPlaying = !video.paused;
    };

    const handleSeekEnd = () => {
        isUserSeeking = false;
    };

    // Handle trim region looping using requestAnimationFrame
    const checkTimeAndLoop = () => {
        if (!isUserSeeking && trimBtn.classList.contains('active') && video.loop && !video.paused) {
            if (video.currentTime >= trimEnd || video.currentTime + metadata.frameTime < trimStart) {
                video.currentTime = trimStart;
                if (wasPlaying) video.play();
            }
        }
        
        animationFrameId = requestAnimationFrame(checkTimeAndLoop);
    };

    const startTimeChecking = () => {
        if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(checkTimeAndLoop);
        }
    };

    const stopTimeChecking = () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    };
    
    // Handle keyboard shortcuts for trim points
    const handleTrimKeyboard = (e) => {
        // Only process if trim mode is active
        if (!trimBtn.classList.contains('active')) return;
        
        // Use character rather than keyCode for better keyboard layout support
        const char = e.key;
        if (char === '[') {
            trimStart = video.currentTime;
            updateTrimRegion();
        } else if (char === ']') {
            trimEnd = video.currentTime;
            updateTrimRegion();
        }
    };

    const init = () => {
        setupHandleDrag(leftHandle, true);
        setupHandleDrag(rightHandle, false);
        
        trimBtn.addEventListener('click', toggleTrimMode);
        
        // Start animation frame loop when video starts playing
        video.addEventListener('play', startTimeChecking);
        video.addEventListener('pause', stopTimeChecking);
        
        // Handle seeking states
        progressContainer.addEventListener('mousedown', handleSeekStart);
        document.addEventListener('mouseup', handleSeekEnd);
        
        // Handle keyboard shortcuts
        document.addEventListener('keypress', handleTrimKeyboard);
        
        // Reset trim positions when a new video is loaded
        video.addEventListener('loadedmetadata', () => {
            trimStart = 0;
            trimEnd = video.duration || 0;
            window.trimStart = undefined;
            window.trimEnd = undefined;
            
            // If trim mode is active, update the UI
            if (trimBtn.classList.contains('active')) {
                updateTrimRegion();
            }
        });

        // Clean up on page unload
        window.addEventListener('unload', () => {
            stopTimeChecking();
            document.removeEventListener('keypress', handleTrimKeyboard);
        });
    };
    
    return {
        init,
        toggleTrimMode
    };
};