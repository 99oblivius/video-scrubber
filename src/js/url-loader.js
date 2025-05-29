const { invoke } = window.__TAURI__.core;

export const setupUrlLoader = (video, dropContainer, metadata) => {
    const $ = document.querySelector.bind(document);
    const dropError = $('#dropError');
    const urlInput = $('#videoUrlInput');
    const loadUrlButton = $('#loadUrlButton');
    
    const showError = (message) => {
        dropError.textContent = message;
        dropError.style.opacity = '1';
        setTimeout(() => dropError.style.opacity = '0', 3000);
    };
    
    const loadVideoFromUrl = async (url) => {
        try {
            loadUrlButton.disabled = true;
            loadUrlButton.textContent = 'Loading...';
            dropError.style.opacity = '0';
            
            const streamingUrl = await invoke('get_best_streaming_url', { 
                url,
                format_preference: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
            });
            
            const videoInfo = await invoke('get_yt_video_info', { url });
            
            const virtualFile = {
                path: url,
                name: `${videoInfo.title || 'Unknown Title'}.mp4`,
                size: 0,
                type: 'video/mp4',
                lastModified: Date.now(),
                isStream: true,
                originalUrl: url,
                streamingUrl: streamingUrl
            };
            
            video.src = streamingUrl;
            video.focus();
            dropContainer.classList.remove('no-video');
            
            const videoLoadEvent = new CustomEvent('videoFileLoaded', { 
                detail: { file: virtualFile } 
            });
            
            video.addEventListener('loadedmetadata', async () => {
                await metadata.updateMetadataDisplay(virtualFile);
                video.dispatchEvent(videoLoadEvent);
            }, { once: true });
            
            return true;
        } catch (error) {
            console.error('Failed to load video from URL:', error);
            showError('Failed to load video from URL');
            return false;
        } finally {
            loadUrlButton.disabled = false;
            loadUrlButton.textContent = 'Load';
        }
    };

    
    const init = () => {
        const urlInputContainer = $('.url-input-container');
        const urlInput = $('#videoUrlInput');

        urlInputContainer.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        urlInputContainer.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        urlInputContainer.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        });

        loadUrlButton.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (!url) {
                showError('Please enter a valid URL');
                return;
            }
            loadVideoFromUrl(url);
        });
        
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                loadUrlButton.click();
            }
        });
    };
    
    return {
        init,
        loadVideoFromUrl
    };
};
