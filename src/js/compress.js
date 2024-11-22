export const setupCompress = (video) => {
    const $ = document.querySelector.bind(document);
    const compress = $('#compress');
    const compressBtn = $('#compress-button');

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

    const setupSelect = (options, id) => {    
        const select = document.getElementById(id);
        
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });
    };

    const setupQualitySlider = () => {
        const slider = $('#quality-slider');
        const value = $('.slider-value');
        slider.addEventListener('input', () => {
            value.textContent = slider.value + '%';
        });
    };

    const setupCompressContent = () => {
        setupSelect(VIDEO_CODECS, 'video-codec-select');
        setupSelect(AUDIO_CODECS, 'audio-codec-select');
        setupQualitySlider();
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
    };

    return {
        init,
        toggleCompress
    };
};