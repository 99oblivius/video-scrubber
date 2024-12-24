export const setupCrop = (video) => {
    const $ = document.querySelector.bind(document);
    const crop = $('#crop');
    const cropBtn = $('#crop-button');

    const ASPECT_RATIOS = [
        { value: '1:1', label: '1:1' },
        { value: '16:9', label: '16:9' },
        { value: '4:3', label: '4:3' }
    ];

    const calculateCropDimensions = (videoWidth, videoHeight, ratio) => {
        const [w, h] = ratio.split(':').map(Number);
        const targetRatio = w / h;
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
        
        ASPECT_RATIOS.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });

        select.addEventListener('change', () => {
            const selectedValue = select.value;
            if (selectedValue === 'none') {
                crop.classList.remove('active');
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

        // Setup orientation toggle
        $('#flip-orientation-button').addEventListener('click', () => {
            const select = $('#ratio-select');
            const ratio = select.value;
            const [w, h] = ratio.split(':');
            select.value = `${h}:${w}`;
            if (cropBtn.classList.contains('active')) {
                updateCropOverlay(select.value);
            }
        });

        // Setup no crop button
        $('#no-crop-button').addEventListener('click', () => {
            crop.classList.remove('active');
            cropBtn.classList.remove('active');
            $('.crop-overlay').style.display = 'none';
        });
    };

    const toggleCrop = () => {
        crop.classList.toggle('active');
        cropBtn.classList.toggle('active');
        $('.crop-overlay').style.display = crop.classList.contains('active') ? 'block' : 'none';
    
        if (crop.classList.contains('active')) {
            updateCropOverlay($('#ratio-select').value);
            
            // Handle outside clicks
            setTimeout(() => {
                document.addEventListener('click', handleOutsideClick);
            }, 0);
        } else {
            document.removeEventListener('click', handleOutsideClick);
        }
    };

    const handleOutsideClick = (e) => {
        if (!crop.contains(e.target) && !cropBtn.contains(e.target)) {
            crop.classList.remove('active');
            cropBtn.classList.remove('active');
            $('.crop-overlay').style.display = 'none';
            document.removeEventListener('click', handleOutsideClick);
        }
    };

    const getCurrentCrop = () => {
        const ratio = $('#ratio-select').value;
        if (ratio === 'none' || !cropBtn.classList.contains('active')) return null;
        
        return calculateCropDimensions(video.videoWidth, video.videoHeight, ratio);
    };

    const init = () => {
        setupCropContent();
        cropBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCrop();
        });
    };

    return {
        init,
        toggleCrop,
        getCurrentCrop
    };
};