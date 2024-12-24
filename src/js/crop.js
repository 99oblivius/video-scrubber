export const setupCrop = (video, settings) => {
    const $ = document.querySelector.bind(document);
    const crop = $('#crop');
    const cropBtn = $('#crop-button');
    const videoWrapper = $('.video-wrapper');
    
    let relativeCropSettings = {
        xPercent: 0.5,
        yPercent: 0.5,
        widthPercent: 0,
        heightPercent: 0
    };

    const ASPECT_RATIOS = [
        { value: '1:1', label: '1:1' },
        { value: '16:9', label: '16:9' },
        { value: '4:3', label: '4:3' }
    ];

    const calculateCropDimensions = (videoWidth, videoHeight, ratio, preservePosition = false) => {
        const [w, h] = ratio.split(':').map(Number);
        const isVertical = settings.get('cropOrientation') === 'vertical';
        const targetRatio = isVertical ? h / w : w / h;
        const currentRatio = videoWidth / videoHeight;
    
        let cropWidth, cropHeight;
        if (targetRatio > currentRatio) {
            cropWidth = videoWidth;
            cropHeight = Math.round(cropWidth / targetRatio);
        } else {
            cropHeight = videoHeight;
            cropWidth = Math.round(cropHeight * targetRatio);
        }
        
        cropWidth = cropWidth % 2 === 0 ? cropWidth : cropWidth - 1;
        cropHeight = cropHeight % 2 === 0 ? cropHeight : cropHeight - 1;
        
        // Calculate initial centered position
        const x = Math.round((videoWidth - cropWidth) / 2);
        const y = Math.round((videoHeight - cropHeight) / 2);
        
        // Ensure position is even
        const finalX = x % 2 === 0 ? x : x - 1;
        const finalY = y % 2 === 0 ? y : y - 1;

        // Update relative settings if not preserving position
        if (!preservePosition) {
            relativeCropSettings = {
                xPercent: 0.5,
                yPercent: 0.5,
                widthPercent: cropWidth / videoWidth,
                heightPercent: cropHeight / videoHeight
            };
        }
    
        return {
            width: cropWidth,
            height: cropHeight,
            x: finalX,
            y: finalY,
            originalWidth: videoWidth,
            originalHeight: videoHeight
        };
    };

    const updateCropOverlay = () => {
        const overlay = $('.crop-overlay');
        if (!overlay || !video.videoWidth) return;

        const ratio = $('#ratio-select').value;
        const dims = calculateCropDimensions(video.videoWidth, video.videoHeight, ratio, true);
        window.cropSettings = dims;

        const videoRect = video.getBoundingClientRect();
        const videoRatio = video.videoWidth / video.videoHeight;
        const containerRatio = videoRect.width / videoRect.height;
        
        const wrapperStyle = window.getComputedStyle(videoWrapper);
        const paddingLeft = parseFloat(wrapperStyle.paddingLeft);
        const paddingTop = parseFloat(wrapperStyle.paddingTop);
        
        let displayWidth, displayHeight, xOffset, yOffset;
        
        if (videoRatio > containerRatio) {
            displayWidth = videoRect.width;
            displayHeight = displayWidth / videoRatio;
            xOffset = paddingLeft;
            yOffset = (videoRect.height - displayHeight) / 2 + paddingTop;
        } else {
            displayHeight = videoRect.height;
            displayWidth = displayHeight * videoRatio;
            xOffset = (videoRect.width - displayWidth) / 2 + paddingLeft;
            yOffset = paddingTop;
        }
        
        const scale = displayWidth / video.videoWidth;

        requestAnimationFrame(() => {
            overlay.style.width = `${Math.round(dims.width * scale)}px`;
            overlay.style.height = `${Math.round(dims.height * scale)}px`;
            overlay.style.left = `${Math.round(xOffset + dims.x * scale)}px`;
            overlay.style.top = `${Math.round(yOffset + dims.y * scale)}px`;
        });
    };

    const handleCornerDrag = (e, corner) => {
        e.stopPropagation();
        const overlay = $('.crop-overlay');
        const videoRect = video.getBoundingClientRect();
        const videoRatio = video.videoWidth / video.videoHeight;
        const containerRatio = videoRect.width / videoRect.height;
        
        const wrapperStyle = window.getComputedStyle(videoWrapper);
        const paddingLeft = parseFloat(wrapperStyle.paddingLeft);
        const paddingTop = parseFloat(wrapperStyle.paddingTop);

        let displayWidth, displayHeight, xOffset, yOffset;
        if (videoRatio > containerRatio) {
            displayWidth = videoRect.width;
            displayHeight = displayWidth / videoRatio;
            xOffset = paddingLeft;
            yOffset = (videoRect.height - displayHeight) / 2 + paddingTop;
        } else {
            displayHeight = videoRect.height;
            displayWidth = displayHeight * videoRatio;
            xOffset = (videoRect.width - displayWidth) / 2 + paddingLeft;
            yOffset = paddingTop;
        }

        const scale = displayWidth / video.videoWidth;
        const initialX = e.clientX;
        const initialY = e.clientY;
        const initialLeft = parseFloat(overlay.style.left);
        const initialTop = parseFloat(overlay.style.top);

        const handleDrag = (e) => {
            const deltaX = e.clientX - initialX;
            const deltaY = e.clientY - initialY;

            const minX = xOffset;
            const minY = yOffset;
            const maxX = xOffset + displayWidth - overlay.offsetWidth;
            const maxY = yOffset + displayHeight - overlay.offsetHeight;

            const newLeft = Math.max(minX, Math.min(maxX, initialLeft + deltaX));
            const newTop = Math.max(minY, Math.min(maxY, initialTop + deltaY));

            overlay.style.left = `${Math.round(newLeft)}px`;
            overlay.style.top = `${Math.round(newTop)}px`;

            const xInVideo = Math.round((newLeft - xOffset) / scale);
            const yInVideo = Math.round((newTop - yOffset) / scale);
            
            relativeCropSettings.xPercent = xInVideo / video.videoWidth;
            relativeCropSettings.yPercent = yInVideo / video.videoHeight;

            window.cropSettings = {
                ...window.cropSettings,
                x: xInVideo,
                y: yInVideo
            };
        };

        const handleDragEnd = () => {
            document.removeEventListener('mousemove', handleDrag);
            document.removeEventListener('mouseup', handleDragEnd);
        };

        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', handleDragEnd);
    };
    
    const setupSelect = () => {
        const select = document.getElementById('ratio-select');
        select.innerHTML = '';
        ASPECT_RATIOS.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });

        select.value = settings.get('cropAspectRatio') || '16:9';
        select.addEventListener('change', () => {
            settings.set('cropAspectRatio', select.value);
            updateCropOverlay();
            crop.classList.remove('active');
        });
    };

    const createOverlay = () => {
        const existing = $('.crop-overlay');
        if (existing) return;
        
        const overlay = document.createElement('div');
        overlay.className = 'crop-overlay';

        ['tl', 'tr', 'bl', 'br'].forEach(corner => {
            const handle = document.createElement('div');
            handle.className = `crop-handle ${corner}`;
            handle.addEventListener('mousedown', (e) => handleCornerDrag(e, corner));
            overlay.appendChild(handle);
        });

        video.insertAdjacentElement('afterend', overlay);
    };

    const centerCrop = () => {
        if (video.videoWidth && video.videoHeight) {
            // Reset relative settings completely
            relativeCropSettings = {
                xPercent: 0.5,
                yPercent: 0.5,
                widthPercent: 0,
                heightPercent: 0
            };
            const ratio = $('#ratio-select')?.value || settings.get('cropAspectRatio') || '16:9';
            // Get dimensions without position preservation
            const dims = calculateCropDimensions(video.videoWidth, video.videoHeight, ratio, false);
            window.cropSettings = dims;
            // Use updateCropOverlay without position preservation
            const overlay = $('.crop-overlay');
            if (overlay) {
                const videoRect = video.getBoundingClientRect();
                const videoRatio = video.videoWidth / video.videoHeight;
                const containerRatio = videoRect.width / videoRect.height;
                
                const wrapperStyle = window.getComputedStyle(videoWrapper);
                const paddingLeft = parseFloat(wrapperStyle.paddingLeft);
                const paddingTop = parseFloat(wrapperStyle.paddingTop);
                
                let displayWidth, displayHeight, xOffset, yOffset;
                
                if (videoRatio > containerRatio) {
                    displayWidth = videoRect.width;
                    displayHeight = displayWidth / videoRatio;
                    xOffset = paddingLeft;
                    yOffset = (videoRect.height - displayHeight) / 2 + paddingTop;
                } else {
                    displayHeight = videoRect.height;
                    displayWidth = displayHeight * videoRatio;
                    xOffset = (videoRect.width - displayWidth) / 2 + paddingLeft;
                    yOffset = paddingTop;
                }
                
                const scale = displayWidth / video.videoWidth;

                requestAnimationFrame(() => {
                    overlay.style.width = `${Math.round(dims.width * scale)}px`;
                    overlay.style.height = `${Math.round(dims.height * scale)}px`;
                    overlay.style.left = `${Math.round(xOffset + dims.x * scale)}px`;
                    overlay.style.top = `${Math.round(yOffset + dims.y * scale)}px`;
                });
            }
        }
    };

    const setupCropContent = () => {
        setupSelect();
        createOverlay();

        const flipBtn = $('#flip-orientation-button');
        flipBtn.textContent = settings.get('cropOrientation') === 'vertical' ? '▯' : '▭';

        flipBtn.addEventListener('click', () => {
            const newOrientation = settings.get('cropOrientation') === 'vertical' ? 'horizontal' : 'vertical';
            settings.set('cropOrientation', newOrientation);
            flipBtn.textContent = newOrientation === 'vertical' ? '▯' : '▭';
            centerCrop();
        });

        $('#center-crop-button')?.addEventListener('click', centerCrop);

        $('#no-crop-button').addEventListener('click', () => {
            cropBtn.classList.remove('active');
            $('.crop-overlay').style.display = 'none';
            crop.classList.remove('active');
        });
    };

    const toggleCrop = (forceClose = false) => {
        if (forceClose) {
            crop.classList.remove('active');
            return;
        }

        const compress = $('#compress');
        if (compress?.classList.contains('active')) {
            compress.classList.remove('active');
            $('#compress-button').classList.remove('active');
        }

        crop.classList.toggle('active');
        const overlay = $('.crop-overlay');
        
        if (!cropBtn.classList.contains('active')) {
            cropBtn.classList.add('active');
            overlay.style.display = 'block';
            updateCropOverlay();
        }

        const handleOutsideClick = (e) => {
            if (!crop.contains(e.target) && !cropBtn.contains(e.target)) {
                crop.classList.remove('active');
                document.removeEventListener('click', handleOutsideClick);
            }
        };
    
        if (crop.classList.contains('active')) {
            setTimeout(() => {
                document.addEventListener('click', handleOutsideClick);
            }, 0);
        }
    };

    const reset = () => {
        // Reset UI state
        cropBtn.classList.remove('active');
        const overlay = $('.crop-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        crop.classList.remove('active');

        // Reset relative settings to initial state
        relativeCropSettings = {
            xPercent: 0.5,
            yPercent: 0.5,
            widthPercent: 0,
            heightPercent: 0
        };

        // Reset the crop dimensions and position
        if (video.videoWidth && video.videoHeight) {
            const ratio = $('#ratio-select')?.value || settings.get('cropAspectRatio') || '16:9';
            const dims = calculateCropDimensions(video.videoWidth, video.videoHeight, ratio, false);
            window.cropSettings = dims;
            
            if (overlay) {
                overlay.style.left = '50%';
                overlay.style.top = '50%';
            }
        }
    };

    const getCurrentCrop = () => cropBtn.classList.contains('active') ? window.cropSettings : null;

    const init = () => {
        setupCropContent();
        cropBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!cropBtn.classList.contains('active')) {
                // When first activating, ensure centered position
                relativeCropSettings = {
                    xPercent: 0.5,
                    yPercent: 0.5,
                    widthPercent: 0,
                    heightPercent: 0
                };
            }
            toggleCrop();
        });
        video.addEventListener('loadedmetadata', reset);
        video.addEventListener('videoFileLoaded', reset);
        
        const resizeObserver = new ResizeObserver(() => {
            if (cropBtn.classList.contains('active')) {
                updateCropOverlay();
            }
        });
        resizeObserver.observe(videoWrapper);
    };

    return {
        init,
        toggleCrop,
        getCurrentCrop,
        reset
    };
};