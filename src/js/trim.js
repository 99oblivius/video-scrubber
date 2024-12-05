export const setupTrim = (video, metadata) => {
    const $ = document.querySelector.bind(document);
    const trimBtn = $('#trim-button');
    const progressContainer = $('#progressContainer');
    const progressBar = $('.progress-bar');
    
    let trimStart = 0;
    let trimEnd = video.duration || 0;
    let animationFrameId = null;
    
    const createPreviewVideo = () => {
        const previewContainer = document.createElement('div');
        previewContainer.className = 'trim-preview-container';
        previewContainer.style.display = 'none';
        
        const previewVideo = document.createElement('video');
        previewVideo.className = 'trim-preview-video';
        previewVideo.src = video.src;
        previewVideo.muted = true;
        
        previewContainer.appendChild(previewVideo);
        document.body.appendChild(previewContainer);
        
        return { previewContainer, previewVideo };
    };
    
    const { previewContainer, previewVideo } = createPreviewVideo();
    
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
        const frame = Math.floor(time / metadata.getFrameTime());
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
        
        window.trimStart = trimStart;
        window.trimEnd = trimEnd;
    };
    
    const updatePreviewSize = () => {
        if (!video.videoWidth || !video.videoHeight) return;
        
        const MAX_WIDTH = 240;
        const MAX_HEIGHT = 160;
        
        const scaleX = MAX_WIDTH / video.videoWidth;
        const scaleY = MAX_HEIGHT / video.videoHeight;
        const scale = Math.min(scaleX, scaleY);
        
        const width = Math.round(video.videoWidth * scale);
        const height = Math.round(video.videoHeight * scale);
        
        previewContainer.style.width = width + 'px';
        previewContainer.style.height = height + 'px';
    };

    const updatePreviewPosition = (e) => {
        const rect = progressBar.getBoundingClientRect();
        const previewRect = previewContainer.getBoundingClientRect();
        
        let x = e.clientX - previewRect.width / 2;
        let y = rect.top - previewRect.height - 10;
        
        x = Math.max(0, Math.min(x, window.innerWidth - previewRect.width));
        y = Math.max(0, Math.min(y, window.innerHeight - previewRect.height));
        
        previewContainer.style.transform = `translate(${x}px, ${y}px)`;
    };
    
    const setupHandleDrag = (handle, isLeft) => {
        let isDragging = false;
        
        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            e.stopPropagation();
            
            updatePreviewSize();
            previewContainer.style.display = 'block';
            previewVideo.currentTime = isLeft ? trimStart : trimEnd;
            
            const handleDrag = async (e) => {
                if (!isDragging) return;
                
                const rect = progressBar.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                const time = video.duration * Math.max(0, Math.min(1, pos));

                const frameTime = metadata.getFrameTime();
                const frameNumber = Math.round(time / frameTime);
                const snappedTime = frameNumber * frameTime;
                
                if (isLeft) {
                    trimStart = Math.min(snappedTime, trimEnd - frameTime);
                    previewVideo.currentTime = trimStart;
                } else {
                    trimEnd = Math.max(snappedTime, trimStart + frameTime);
                    previewVideo.currentTime = trimEnd;
                }
                
                updateTrimRegion();
                updateProgressHoverTime(isLeft ? trimStart : trimEnd, e.clientX);
                updatePreviewPosition(e);
            };
            
            const stopDrag = () => {
                isDragging = false;
                previewContainer.style.display = 'none';
                progressHoverTime.style.opacity = '0';
                document.removeEventListener('mousemove', handleDrag);
                document.removeEventListener('mouseup', stopDrag);
            };
            
            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', stopDrag);
            
            updatePreviewPosition(e);
        });
    };
    
    const toggleTrimMode = () => {
        const isActive = trimBtn.classList.toggle('active');
        
        leftHandle.style.display = isActive ? 'block' : 'none';
        rightHandle.style.display = isActive ? 'block' : 'none';
        trimRegion.style.display = isActive ? 'block' : 'none';
        
        if (isActive) {
            if (window.trimStart === undefined || window.trimEnd === undefined) {
                trimStart = 0;
                trimEnd = video.duration || 0;
            }
            updateTrimRegion();
        }
    };
    
    let isUserSeeking = false;

    const handleSeekStart = () => {
        isUserSeeking = true;
    };

    const handleSeekEnd = () => {
        isUserSeeking = false;
    };

    const checkTimeAndLoop = () => {
        if (!isUserSeeking && trimBtn.classList.contains('active') && video.loop && !video.paused) {
            if (video.currentTime >= trimEnd || video.currentTime + metadata.getFrameTime() < trimStart) {
                video.currentTime = trimStart;
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
    
    const handleTrimKeyboard = (e) => {
        if (e.code === 'KeyX' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            toggleTrimMode();
            return;
        }
        if (!trimBtn.classList.contains('active')) return;
        
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
        
        video.addEventListener('play', startTimeChecking);
        video.addEventListener('pause', stopTimeChecking);
        
        progressContainer.addEventListener('mousedown', handleSeekStart);
        document.addEventListener('mouseup', handleSeekEnd);
        
        document.addEventListener('keypress', handleTrimKeyboard);
        
        video.addEventListener('loadedmetadata', () => {
            trimStart = 0;
            trimEnd = video.duration || 0;
            window.trimStart = undefined;
            window.trimEnd = undefined;
            
            previewVideo.src = video.src;
            previewVideo.addEventListener('loadedmetadata', updatePreviewSize, { once: true });
            
            if (trimBtn.classList.contains('active')) {
                updateTrimRegion();
            }
        });

        window.addEventListener('unload', () => {
            stopTimeChecking();
            document.removeEventListener('keypress', handleTrimKeyboard);
            previewContainer.remove();
        });
    };
    
    return {
        init,
        toggleTrimMode
    };
};