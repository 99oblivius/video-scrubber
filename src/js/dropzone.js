const { open } = window.__TAURI__.dialog;
const { convertFileSrc } = window.__TAURI__.core;

export const setupDropZone = (video, dropContainer, metadata) => {
    const $ = document.querySelector.bind(document);
    const dropError = $('#dropError');

    const showDropError = (message) => {
        dropError.textContent = message;
        dropError.style.opacity = '1';
        setTimeout(() => dropError.style.opacity = '0', 3000);
    };

    const loadVideo = (file) => {
        if (typeof file === "string") {
            video.src = convertFileSrc(file);
        } else {
            video.src = URL.createObjectURL(file);
        }
        console.log(video.src);
        video.focus();
        dropContainer.classList.remove('no-video');

        try {

            // Dispatch custom event with file data
            const videoLoadEvent = new CustomEvent('videoFileLoaded', { 
                detail: { file } 
            });
            video.dispatchEvent(videoLoadEvent);
            
            // Update metadata when video is loaded
            video.addEventListener('loadedmetadata', () => {
                metadata.updateMetadataDisplay(file);
                metadata.detectFrameRate();
            }, { once: true });
        } catch (error) {
            console.log(`Failed to load video file: ${error}`);
            video.src = null;
            dropContainer.classList.add('no-video');
        }
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

        dropContainer.addEventListener('click', async e => {
            if (video.src) return;
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Video',
                    extensions: ['mp4', 'webm', 'mkv', 'mov', 'avi']
                }]
            });

            if (selected === null) return;
            loadVideo(selected);
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