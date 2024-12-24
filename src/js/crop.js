export const setupCrop = (video, settings) => {
    const $ = document.querySelector.bind(document);
    const crop = $('#crop');
    const cropBtn = $('#crop-button');
    let isVertical = settings.get('cropOrientation') === 'vertical';

    const ASPECT_RATIOS = [
        { value: '1:1', label: '1:1' },
        { value: '16:9', label: '16:9' },
        { value: '4:3', label: '4:3' }
    ];

    const calculateCropDimensions = (videoWidth, videoHeight, ratio) => {
        const [w, h] = ratio.split(':').map(Number);
        const targetRatio = isVertical ? w / h : h / w;
        const currentRatio = videoWidth / videoHeight;

        let cropWidth, cropHeight;

        if (targetRatio > currentRatio) {
            // Width limited
            cropWidth = videoWidth;
            cropHeight = Math.round(cropWidth / targetRatio);
        } else {
            // Height limited
            cropHeight = videoHeight;
            cropWidth = Math.round(cropHeight * targetRatio);
        }

        // Center the crop
        const x = Math.round((videoWidth - cropWidth) / 2);
        const y = Math.round((videoHeight - cropHeight) / 2);

        return { width: cropWidth, height: cropHeight, x, y };
    };

    const setupSelect = () => {
        const select = document.getElementById('ratio-select');
        select.innerHTML = ''; // Clear existing options

        ASPECT_RATIOS.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });

        // Set initial value from settings
        select.value = settings.get('cropAspectRatio');

        select.addEventListener('change', () => {
            const selectedValue = select.value;
            settings.set('cropAspectRatio', selectedValue);

            if (selectedValue === 'none') {
                cropBtn.classList.remove('active');
                $('.crop-overlay').style.display = 'none';
            } else {
                cropBtn.classList.add('active');
                updateCropOverlay(selectedValue);
            }
            // Close the dropdown after selection
            crop.classList.remove('active');
        });
    };

    const updateCropOverlay = (ratio) => {
        const overlay = $('.crop-overlay');
        const videoRect = video.getBoundingClientRect();
        const wrapper = video.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();

        // Calculate the actual video dimensions within its container
        const videoAspect = video.videoWidth / video.videoHeight;
        const containerAspect = videoRect.width / videoRect.height;

        let videoDisplayWidth, videoDisplayHeight;
        if (videoAspect > containerAspect) {
            // Video is wider than container
            videoDisplayWidth = videoRect.width;
            videoDisplayHeight = videoRect.width / videoAspect;
        } else {
            // Video is taller than container
            videoDisplayHeight = videoRect.height;
            videoDisplayWidth = videoRect.height * videoAspect;
        }

        // Calculate the video's position within its container
        const videoX = (videoRect.width - videoDisplayWidth) / 2;
        const videoY = (videoRect.height - videoDisplayHeight) / 2;

        // Calculate crop dimensions in the original video resolution
        const dims = calculateCropDimensions(video.videoWidth, video.videoHeight, ratio);

        // Scale the crop dimensions to match the displayed video size
        const scaleX = videoDisplayWidth / video.videoWidth;
        const scaleY = videoDisplayHeight / video.videoHeight;

        const displayWidth = dims.width * scaleX;
        const displayHeight = dims.height * scaleY;
        const displayX = videoX + (dims.x * scaleX);
        const displayY = videoY + (dims.y * scaleY);

        // Position relative to the video wrapper
        overlay.style.width = `${displayWidth}px`;
        overlay.style.height = `${displayHeight}px`;
        overlay.style.left = `${displayX + wrapperRect.left - videoRect.left}px`;
        overlay.style.top = `${displayY + wrapperRect.top - videoRect.top}px`;
        overlay.style.display = 'block';

        // Store the actual crop dimensions for saving
        window.cropSettings = dims;
    };

    const setupCropContent = () => {
        setupSelect();

        // Create crop overlay if it doesn't exist
        if (!$('.crop-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'crop-overlay';
            // Add span for bottom corner pseudo-elements
            const span = document.createElement('span');
            overlay.appendChild(span);
            video.parentElement.appendChild(overlay);
        }

        const flipBtn = $('#flip-orientation-button');
        flipBtn.textContent = isVertical ? '▯' : '▭';

        // Setup orientation toggle
        flipBtn.addEventListener('click', () => {
            isVertical = !isVertical;
            settings.set('cropOrientation', isVertical ? 'vertical' : 'horizontal');
            flipBtn.textContent = isVertical ? '▯' : '▭';
            if (cropBtn.classList.contains('active')) {
                updateCropOverlay($('#ratio-select').value);
            }
        });

        // Setup no crop button
        $('#no-crop-button').addEventListener('click', () => {
            cropBtn.classList.remove('active');
            $('.crop-overlay').style.display = 'none';
        });
    };

    const toggleCrop = () => {
        crop.classList.toggle('active');

        if (!cropBtn.classList.contains('active')) {
            cropBtn.classList.add('active');
            updateCropOverlay($('#ratio-select').value);
        }
    };

    const getCurrentCrop = () => {
        if (!cropBtn.classList.contains('active')) return null;
        const ratio = $('#ratio-select').value;
        return calculateCropDimensions(video.videoWidth, video.videoHeight, ratio);
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

        // Reset crop when video changes
        video.addEventListener('loadedmetadata', reset);
    };

    return {
        init,
        toggleCrop,
        getCurrentCrop,
        reset
    };
};