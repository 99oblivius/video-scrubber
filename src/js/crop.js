export const setupCrop = (video, settings) => {
    const $ = document.querySelector.bind(document);
    const crop = $('#crop');
    const cropBtn = $('#crop-button');
    const videoWrapper = $('.video-wrapper');
    
    const ASPECT_RATIOS = [
        { value: '1:1', label: '1:1' },
        { value: '16:9', label: '16:9' },
        { value: '4:3', label: '4:3' }
    ];

    const calculateCropDimensions = (videoWidth, videoHeight, ratio) => {
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

        const x = Math.round((videoWidth - cropWidth) / 2);
        const y = Math.round((videoHeight - cropHeight) / 2);

        return { width: cropWidth, height: cropHeight, x, y };
    };

    const updateCropOverlay = () => {
        const overlay = $('.crop-overlay');
        if (!overlay || !video.videoWidth) return;

        const ratio = $('#ratio-select').value;
        const dims = calculateCropDimensions(video.videoWidth, video.videoHeight, ratio);
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
        const span = document.createElement('span');
        overlay.appendChild(span);
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