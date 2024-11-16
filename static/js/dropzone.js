export const setupDropZone = (video, dropContainer, metadata) => {
    const $ = document.querySelector.bind(document);
    const dropError = $('#dropError');

    const showDropError = (message) => {
        dropError.textContent = message;
        dropError.style.opacity = '1';
        setTimeout(() => dropError.style.opacity = '0', 3000);
    };

    const loadVideo = (file) => {
        video.src = URL.createObjectURL(file);
        video.focus();
        dropContainer.classList.remove('no-video');
        
        // Update metadata when video is loaded
        video.addEventListener('loadedmetadata', () => {
            metadata.updateMetadataDisplay(file);
            metadata.detectFrameRate();
        }, { once: true });
    };

    const init = () => {
        dropContainer.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            dropContainer.classList.add('drop-active');
        });

        dropContainer.addEventListener('dragleave', e => {
            e.preventDefault();
            e.stopPropagation();
            dropContainer.classList.remove('drop-active');
        });

        dropContainer.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            dropContainer.classList.remove('drop-active');
            const files = e.dataTransfer.files;
            if (files.length === 0) {
                showDropError('No file detected');
            } else if (files.length > 1) {
                showDropError('Please drop only one file');
            } else if (!files[0].type.startsWith('video/')) {
                showDropError('File must be a video');
            } else {
                loadVideo(files[0]);
            }
        });
    };

    return {
        init,
        loadVideo
    };
};