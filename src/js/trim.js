export const setupTrim = (video, metadata) => {
    const $ = document.querySelector.bind(document);
    const trimBtn = $('#trim-button');
    const progressContainer = $('#progressContainer');
    const progressBar = $('.progress-bar');
    const progressHover = $('#progressHover');
    
    let trimStart = 0;
    let trimEnd = video.duration || 0;
    let animationFrameId = null;
    
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
    
    const updateProgressHover = (time, x) => {
        const frame = Math.floor(time / metadata.getFrameTime());
        progressHover.textContent = `${time.toFixed(3)}s (Frame ${frame})`;
        progressHover.style.left = `${x}px`;
        progressHover.style.opacity = '1';
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
    
    const setupHandleDrag = (handle, isLeft) => {
        let isDragging = false;
        
        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            e.stopPropagation();
            
            const previewVideo = document.createElement('video');
            previewVideo.className = 'trim-preview-video';
            previewVideo.src = video.children[0].src;
            previewVideo.muted = true;
            
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
                } else {
                    trimEnd = Math.max(snappedTime, trimStart + frameTime);
                }
                
                updateTrimRegion();
                
                progressHover.innerHTML = '';
                progressHover.appendChild(previewVideo);
                
                const timeSpan = document.createElement('span');
                timeSpan.id = 'progressHoverTime';
                timeSpan.textContent = `${metadata.formatTime(snappedTime)} (Frame ${frameNumber})`;
                progressHover.appendChild(timeSpan);
                
                previewVideo.currentTime = snappedTime;
                
                progressHover.style.opacity = '1';
                const tooltipWidth = progressHover.offsetWidth;
                let x = e.clientX;
                const minX = tooltipWidth / 2;
                const maxX = window.innerWidth - tooltipWidth / 2;
                x = Math.max(minX, Math.min(maxX, x));
                
                progressHover.style.left = `${x}px`;
                progressHover.style.top = `${rect.y - (previewVideo ? 190 : 35)}px`;
            };
            
            const stopDrag = () => {
                isDragging = false;
                progressHover.style.opacity = '0';
                progressHover.innerHTML = '';
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
        if (!video.innerHTML.trim()) return;
        
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        if (e.code === 'KeyX' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
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
        } else if (char === '{') {
            trimStart = 0.;
            updateTrimRegion();
        } else if (char === '}') {
            trimEnd = video.duration;
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
            
            if (trimBtn.classList.contains('active')) {
                updateTrimRegion();
            }
        });

        window.addEventListener('unload', () => {
            stopTimeChecking();
            document.removeEventListener('keypress', handleTrimKeyboard);
            previewVideo.remove();
        });
    };
    
    return {
        init,
        toggleTrimMode
    };
};