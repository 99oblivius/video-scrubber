const { open } = window.__TAURI__.dialog;
const { convertFileSrc } = window.__TAURI__.core;

export const setupDropZone = (video, dropContainer, metadata) => {
    const $ = document.querySelector.bind(document);
    const dropError = $('#dropError');
    const videoWrapper = $('.video-wrapper');
    const clickableArea = $('.clickable-area');

    const showDropError = (message) => {
        dropError.textContent = message;
        dropError.style.opacity = '1';
        setTimeout(() => dropError.style.opacity = '0', 3000);
    };

    const createFileObject = async (path) => {
        try {
            const stats = await window.__TAURI__.fs.stat(path);
            return {
                path: path,
                name: path.split('/').pop().split('\\').pop(),
                size: stats.size,
                type: 'video/' + path.split('.').pop().toLowerCase(),
                lastModified: stats.mtime,
            };
        } catch (error) {
            console.error('Error creating file object:', error);
            throw error;
        }
    };

    const loadVideo = async (path) => {
        try {
            const wasPlaying = !video.paused;
            
            const fileObject = await createFileObject(path);
            video.src = convertFileSrc(fileObject.path);
            video.focus();
            dropContainer.classList.remove('no-video');

            const videoLoadEvent = new CustomEvent('videoFileLoaded', { 
                detail: { file: fileObject } 
            });
            video.dispatchEvent(videoLoadEvent);
            
            video.addEventListener('loadedmetadata', async () => {
                await metadata.updateMetadataDisplay(fileObject);
                if (wasPlaying) {
                    try {
                        await video.play();
                    } catch (playError) {
                        console.warn('Auto-play failed:', playError);
                    }
                }
            }, { once: true });
        } catch (error) {
            console.error('Failed to load video file:', error);
            showDropError('Failed to load video file');
            video.src = null;
            dropContainer.classList.add('no-video');
        }
    };

    const openVideoFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Video',
                    extensions: ['mp4', 'webm', 'mkv', 'mov', 'avi']
                }]
            });

            if (selected === null) return;
            await loadVideo(selected);
        } catch (error) {
            console.error('Error opening file:', error);
            showDropError('Failed to open video file');
        }
    };

    const init = () => {
        window.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
        });

        window.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        clickableArea.addEventListener('click', async e => {
            await openVideoFile();
        });
        
        clickableArea.addEventListener('keydown', async e => {
            if (e.code === "Enter" || e.code === "Space") {
                e.stopPropagation();
                await openVideoFile();
                clickableArea.blur();
            }
        });
    };

    return {
        init,
        loadVideo,
        openVideoFile
    };
};