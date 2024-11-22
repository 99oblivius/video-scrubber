const { message } = window.__TAURI__.dialog;
const { save } = globalThis.__TAURI__.dialog;

export const setupCompress = (video) => {
    const $ = document.querySelector.bind(document);
    const compress = $('#compress');
    const compressBtn = $('#compress-button');
    const compressContent = $('.compress-content');
    let currentFile = null;

    // Codec support matrix
    const CODEC_CONTAINER_SUPPORT = {
        'h264': ['mp4', 'mkv', 'mov', 'avi'],
        'h265': ['mp4', 'mkv', 'mov'],
        'av1': ['mp4', 'mkv', 'webm'],
        'vp8': ['webm', 'mkv'],
        'vp9': ['webm', 'mkv', 'mp4'],
        'auto': ['mp4', 'webm', 'mkv', 'mov', 'avi']
    };

    // Audio codec support matrix
    const AUDIO_CONTAINER_SUPPORT = {
        'aac': ['mp4', 'mkv', 'mov', 'avi'],
        'mp3': ['mp4', 'mkv', 'mov', 'avi'],
        'opus': ['webm', 'mkv'],
        'vorbis': ['webm', 'mkv'],
        'ac3': ['mp4', 'mkv', 'mov'],
        'flac': ['mkv'],
        'auto': ['mp4', 'webm', 'mkv', 'mov', 'avi']
    };

    const VIDEO_CODECS = [
        { value: 'auto', label: 'Auto' },
        { value: 'h264', label: 'H.264/AVC' },
        { value: 'h265', label: 'H.265/HEVC' },
        { value: 'av1', label: 'AV1' },
        { value: 'vp8', label: 'VP8' },
        { value: 'vp9', label: 'VP9' }
    ];

    const AUDIO_CODECS = [
        { value: 'auto', label: 'Auto' },
        { value: 'aac', label: 'AAC' },
        { value: 'mp3', label: 'MP3' },
        { value: 'opus', label: 'Opus' },
        { value: 'vorbis', label: 'Vorbis' },
        { value: 'ac3', label: 'AC3' },
        { value: 'flac', label: 'FLAC' }
    ];

    const getCompatibleContainers = (videoCodec, audioCodec) => {
        const videoSupported = CODEC_CONTAINER_SUPPORT[videoCodec] || [];
        const audioSupported = AUDIO_CONTAINER_SUPPORT[audioCodec] || [];
        
        // Find containers that support both selected codecs
        return videoSupported.filter(container => 
            audioSupported.includes(container)
        );
    };

    const setupSelect = (options, id) => {    
        const select = document.getElementById(id);
        
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });

        // Add change event listeners to codec selects
        if (id === 'video-codec-select' || id === 'audio-codec-select') {
            select.addEventListener('change', updateContainerOptions);
        }
    };

    const updateContainerOptions = () => {
        const videoCodec = $('#video-codec-select').value;
        const audioCodec = $('#audio-codec-select').value;
        
        const compatibleContainers = getCompatibleContainers(videoCodec, audioCodec);
        
        // Store the current container if it exists
        const originalContainer = currentFile ? 
            currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1).toLowerCase() : null;

        // Update save button state
        const saveButton = $('.compress-save-button');
        if (compatibleContainers.length === 0) {
            saveButton.disabled = true;
            saveButton.title = 'Selected codec combination has no compatible containers';
        } else {
            saveButton.disabled = false;
            saveButton.title = '';
        }

        // Store compatible containers for use in save dialog
        compress.dataset.compatibleContainers = JSON.stringify(compatibleContainers);

        // Optionally show a warning if current container isn't compatible
        if (originalContainer && !compatibleContainers.includes(originalContainer)) {
            showContainerWarning(compatibleContainers);
        } else {
            hideContainerWarning();
        }
    };

    const showContainerWarning = (compatibleContainers) => {
        let warningEl = $('.codec-container-warning');
        if (!warningEl) {
            warningEl = document.createElement('div');
            warningEl.className = 'codec-container-warning';
            compressContent.appendChild(warningEl);
        }
        warningEl.textContent = `Note: Current container format not supported with selected codecs. 
            Will save as ${compatibleContainers[0]}.`;
    };

    const hideContainerWarning = () => {
        const warningEl = $('.codec-container-warning');
        if (warningEl) {
            warningEl.remove();
        }
    };

    const setupQualitySlider = () => {
        const slider = $('#quality-slider');
        const value = $('.slider-value');
        console.log(slider);
        slider.addEventListener('input', () => {
            value.textContent = slider.value + '%';
        });
    };

    const setupCompressContent = () => {
        setupSelect(VIDEO_CODECS, 'video-codec-select');
        setupSelect(AUDIO_CODECS, 'audio-codec-select');
        setupQualitySlider();
        
        const saveButton = $('.compress-save-button');
        saveButton.addEventListener('click', handleCompress);
    };

    const handleCompress = async () => {
        console.log(currentFile.path);
        if (!currentFile) return;

        const videoCodec = $('#video-codec-select').value;
        const audioCodec = $('#audio-codec-select').value;
        const quality = $('#quality-slider').value;

        // Get compatible containers
        const compatibleContainers = getCompatibleContainers(videoCodec, audioCodec);
        if (compatibleContainers.length === 0) {
            console.error('No compatible containers for selected codecs');
            return;
        }

        // Prioritize current container if compatible
        const currentContainer = currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1).toLowerCase();
        let containers = compatibleContainers;
        if (compatibleContainers.includes(currentContainer)) {
            containers = [currentContainer, ...compatibleContainers.filter(c => c !== currentContainer)];
        }

        const outputPath = await save({
            defaultPath: currentFile.defaultPath,
            filters: [{
                name: 'Compatible Formats',
                extensions: containers
            }]
        });

        if (!outputPath) return;

        const container = outputPath.substring(outputPath.lastIndexOf('.') + 1).toLowerCase();
        
        try {
            // await window.__TAURI__.invoke('compress_video', {
            //     sourcePath: currentFile.path,
            //     container,
            //     videoCodec,
            //     audioCodec,
            //     quality: parseInt(quality),
            //     outputName: outputPath
            // });
            await message(`Compression succeeded: ${outputPath}`, 'Video Editor');

            toggleCompress();
        } catch (error) {
            console.error('Compression failed:', error);
            await message('Compression failed\nLook at the developer console for more information.', { title: 'Video Editor', kind: 'error' });
        }
    };

    const toggleCompress = () => {
        compress.classList.toggle('active');
        compressBtn.classList.toggle('active');
    
        // Handle outside clicks
        const handleOutsideClick = (e) => {
            if (!compress.contains(e.target) && !compressBtn.contains(e.target)) {
                compress.classList.remove('active');
                compressBtn.classList.remove('active');
                document.removeEventListener('click', handleOutsideClick);
            }
        };
    
        if (compress.classList.contains('active')) {
            setTimeout(() => {
                document.addEventListener('click', handleOutsideClick);
            }, 0);
        }
    };

    const init = () => {
        setupCompressContent();
        compressBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCompress();
        });

        video.addEventListener('videoFileLoaded', (event) => {
            currentFile = event.detail.file;
            updateContainerOptions();
        });
    };

    return {
        init,
        toggleCompress
    };
};