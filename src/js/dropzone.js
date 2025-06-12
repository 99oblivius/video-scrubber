const { open } = window.__TAURI__.dialog;
const { convertFileSrc } = window.__TAURI__.core;

export const setupDropZone = (video, dropContainer, metadata) => {
    const $ = document.querySelector.bind(document);
    const dropZone = $(".drop-zone");
    const dropError = $('#dropError');
    const videoWrapper = $('.video-wrapper');
    const clickableArea = $('.clickable-area');

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

    const setAddMedia = (action) => {
        const shouldAdd = (action == null) ? !dropContainer.classList.contains("add-media") : action;

        if (shouldAdd) {
            dropContainer.classList.add("add-media");
            dropZone.inert = false;
        } else {
            dropContainer.classList.remove("add-media");
            dropZone.inert = true;
        }
    };

    const loadVideo = async (path) => {
        try {
            const wasPlaying = !video.paused;
            
            const fileObject = await createFileObject(path);
            video.src = convertFileSrc(fileObject.path);
            video.focus();
            setAddMedia(false);

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
            window.showNotification("Failed to load video file", "error");
            video.src = null;
            dropContainer.classList.add('add-media');
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
            window.showNotification("Failed to open video file", "error");
        }
    };

    const init = () => {
        dropZone.inert = !dropContainer.classList.contains("add-media");

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
        openVideoFile,
        setAddMedia
    };
};