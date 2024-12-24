export const setupCrop = (video, settings) => {
    const $ = document.querySelector.bind(document);
    const crop = $('#crop');
    const cropBtn = $('#crop-button');
    const videoWrapper = $('.video-wrapper');
    
    // Store crop settings as percentages of video dimensions
    let relativeCropSettings = {
        xPercent: 0,
        yPercent: 0,
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
    
        // If preserving position, use the stored relative positions
        let x, y;
        if (preservePosition && relativeCropSettings.widthPercent > 0) {
            x = Math.round(videoWidth * relativeCropSettings.xPercent);
            y = Math.round(videoHeight * relativeCropSettings.yPercent);
        } else {
            // Calculate center position
            x = Math.round((videoWidth - cropWidth) / 2);
            y = Math.round((videoHeight - cropHeight) / 2);
        }
    
        // Ensure x and y are even numbers for better video compatibility
        x = x % 2 === 0 ? x : x - 1;
        y = y % 2 === 0 ? y : y - 1;
    
        // Store the relative positions as percentages
        relativeCropSettings = {
            xPercent: x / videoWidth,
            yPercent: y / videoHeight,
            widthPercent: cropWidth / videoWidth,
            heightPercent: cropHeight / videoHeight
        };
    
        // Ensure crop dimensions are even and divisible by 2
        cropWidth = cropWidth % 2 === 0 ? cropWidth : cropWidth - 1;
        cropHeight = cropHeight % 2 === 0 ? cropHeight : cropHeight - 1;
    
        const cropSettings = {
            width: cropWidth,   // Actual pixel width of crop
            height: cropHeight, // Actual pixel height of crop
            x: x,               // X offset from left
            y: y,               // Y offset from top
            originalWidth: videoWidth,   // Original video width (useful for future custom resolution)
            originalHeight: videoHeight  // Original video height
        };
    
        window.cropSettings = cropSettings;
        return cropSettings;
    };

    const updateCropOverlay = () => {
        const overlay = $('.crop-overlay');
        if (!overlay || !video.videoWidth) return;

        const ratio = $('#ratio-select').value;
        const dims = calculateCropDimensions(video.videoWidth, video.videoHeight, ratio, true);
        console.log('Crop settings set:', dims);
        window.cropSettings = dims;

        const videoRect = video.getBoundingClientRect();
        const videoAspect = video.videoWidth / video.videoHeight;
        const containerAspect = videoRect.width / videoRect.height;
        const wrapperStyle = window.getComputedStyle(videoWrapper);
        const paddingLeft = parseFloat(wrapperStyle.paddingLeft);
        const paddingTop = parseFloat(wrapperStyle.paddingTop);

        let displayWidth, displayHeight, xOffset, yOffset;

        if (videoAspect > containerAspect) {
            displayWidth = videoRect.width;
            displayHeight = displayWidth / videoAspect;
            xOffset = paddingLeft;
            yOffset = (videoRect.height - displayHeight) / 2 + paddingTop;
        } else {
            displayHeight = videoRect.height;
            displayWidth = displayHeight * videoAspect;
            xOffset = (videoRect.width - displayWidth) / 2 + paddingLeft;
            yOffset = paddingTop;
        }

        const scale = displayWidth / video.videoWidth;

        requestAnimationFrame(() => {
            overlay.style.width = `${dims.width * scale}px`;
            overlay.style.height = `${dims.height * scale}px`;
            overlay.style.left = `${xOffset + (dims.x * scale)}px`;
            overlay.style.top = `${yOffset + (dims.y * scale)}px`;
        });
    };

    const handleCornerDrag = (e, corner) => {
        e.stopPropagation();
        const overlay = $('.crop-overlay');
        const videoRect = video.getBoundingClientRect();
        const wrapperStyle = window.getComputedStyle(videoWrapper);
        const paddingLeft = parseFloat(wrapperStyle.paddingLeft);
        const paddingTop = parseFloat(wrapperStyle.paddingTop);

        const initialX = e.clientX;
        const initialY = e.clientY;
        const initialLeft = parseFloat(overlay.style.left);
        const initialTop = parseFloat(overlay.style.top);

        const handleDrag = (e) => {
            const deltaX = e.clientX - initialX;
            const deltaY = e.clientY - initialY;

            const videoAspect = video.videoWidth / video.videoHeight;
            const containerAspect = videoRect.width / videoRect.height;
            
            let displayWidth, displayHeight;
            if (videoAspect > containerAspect) {
                displayWidth = Math.floor(videoRect.width);
                displayHeight = Math.floor(displayWidth / videoAspect);
            } else {
                displayHeight = Math.floor(videoRect.height);
                displayWidth = Math.floor(displayHeight * videoAspect);
            }

            const xOffset = Math.floor(paddingLeft + (videoRect.width - displayWidth) / 2);
            const yOffset = Math.floor(paddingTop + (videoRect.height - displayHeight) / 2);

            const minX = xOffset;
            const minY = yOffset;
            const maxX = minX + displayWidth - overlay.offsetWidth;
            const maxY = minY + displayHeight - overlay.offsetHeight;

            const newLeft = Math.max(minX, Math.min(maxX, initialLeft + deltaX));
            const newTop = Math.max(minY, Math.min(maxY, initialTop + deltaY));

            overlay.style.left = `${Math.floor(newLeft)}px`;
            overlay.style.top = `${Math.floor(newTop)}px`;

            // Update relative positions
            const scale = displayWidth / video.videoWidth;
            relativeCropSettings.xPercent = (newLeft - xOffset) / (displayWidth);
            relativeCropSettings.yPercent = (newTop - yOffset) / (displayHeight);

            // Update window.cropSettings
            window.cropSettings = {
                ...window.cropSettings,
                x: Math.round(relativeCropSettings.xPercent * video.videoWidth),
                y: Math.round(relativeCropSettings.yPercent * video.videoHeight)
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

    const centerCrop = () => {
        const ratio = $('#ratio-select').value;
        const dims = calculateCropDimensions(video.videoWidth, video.videoHeight, ratio);
        window.cropSettings = dims;
        updateCropOverlay();
    };
    
    const createOverlay = () => {
        const existing = $('.crop-overlay');
        if (existing) return;
        
        const overlay = document.createElement('div');
        overlay.className = 'crop-overlay';

        // Create corner handles
        ['tl', 'tr', 'bl', 'br'].forEach(corner => {
            const handle = document.createElement('div');
            handle.className = `crop-handle ${corner}`;
            handle.addEventListener('mousedown', (e) => handleCornerDrag(e, corner));
            overlay.appendChild(handle);
        });

        video.insertAdjacentElement('afterend', overlay);
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
            updateCropOverlay();
        });

        $('#center-crop-button').addEventListener('click', () => {
            centerCrop();
        });

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

        // Close compress window if open
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

    const getCurrentCrop = () => {
        if (!cropBtn.classList.contains('active')) return null;
        return window.cropSettings;
    };

    const reset = () => {
        cropBtn.classList.remove('active');
        $('.crop-overlay').style.display = 'none';
        crop.classList.remove('active');
    };

    const init = () => {
        setupCropContent();
        
        cropBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCrop();
        });

        video.addEventListener('loadedmetadata', reset);
        
        const resizeObserver = new ResizeObserver(() => {
            if (cropBtn.classList.contains('active')) {
                updateCropOverlay();
            }
        });

        resizeObserver.observe(videoWrapper);
    };

    return { init, toggleCrop, getCurrentCrop, reset };
};