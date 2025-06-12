const { invoke } = window.__TAURI__.core;

export const setupUrlLoader = (video, dropContainer, metadata, dropzone) => {
    const $ = document.querySelector.bind(document);
    const dropError = $('#dropError');
    const urlInput = $('#videoUrlInput');
    const loadUrlButton = $('#loadUrlButton');
    
    const showError = (message) => {
        dropError.textContent = message;
        dropError.style.opacity = '1';
        setTimeout(() => dropError.style.opacity = '0', 3000);
    };
    
    const normalizeCodec = (codec) => {
        if (!codec) return null;
        const c = codec.toLowerCase();
        
        if (/^(h264|avc)/i.test(codec)) return 'h264';
        if (/^(h265|hevc|hev)/i.test(codec)) return 'h265';
        if (/^av0?1/i.test(codec)) return 'av1';
        if (/^vp0?8/i.test(codec)) return 'vp8';
        if (/^vp0?9/i.test(codec)) return 'vp9';
        if (/^(aac|mp4a)/i.test(codec)) return 'aac';
        if (/^mp3/i.test(codec)) return 'mp3';
        if (/^opus/i.test(codec)) return 'opus';
        if (/^vorbis/i.test(codec)) return 'vorbis';
        if (/^(ac-?3|eac-?3)/i.test(codec)) return 'ac3';
        if (/^flac/i.test(codec)) return 'flac';
        
        return codec;
    };
    
    const loadVideoFromUrl = async (url) => {
        try {
            loadUrlButton.disabled = true;
            loadUrlButton.textContent = 'Loading...';
            loadUrlButton.style.pointerEvents = 'none';
            urlInput.disabled = true;
            dropError.style.opacity = '0';
            
            const streamingUrl = await invoke('get_best_streaming_url', { url, format_preference: 'b' });
            const videoInfo = await invoke('get_yt_video_info', { url });
            
            const width = videoInfo.width || (videoInfo.formats && videoInfo.formats[0]?.width) || 0;
            const height = videoInfo.height || (videoInfo.formats && videoInfo.formats[0]?.height) || 0;
            const fps = videoInfo.fps || (videoInfo.formats && videoInfo.formats[0]?.fps) || 30;
            const duration = videoInfo.duration || 0;
            const size = videoInfo.filesize || videoInfo.filesize_approx || 0;
            const title = videoInfo.title || 'Unknown Title';
            
            const getRecentEntries = () => {
                const stored = localStorage.getItem('recentVideoEntries');
                return stored ? JSON.parse(stored) : [];
            };
            
            const saveRecentEntry = (url, title) => {
                let recent = getRecentEntries();
                recent = recent.filter(entry => entry.url !== url);
                recent.unshift({ url, title: title || url });
                recent = recent.slice(0, 5);
                localStorage.setItem('recentVideoEntries', JSON.stringify(recent));
            };
            
            saveRecentEntry(url, title);
            
            const datalist = document.getElementById('url-suggestions');
            if (datalist) {
                datalist.innerHTML = '';
                getRecentEntries().forEach(entry => {
                    const option = document.createElement('option');
                    option.value = entry.url;
                    option.label = entry.title;
                    datalist.appendChild(option);
                });
            }
            
            const virtualFile = {
                path: url,
                name: `${title}.${videoInfo.ext || videoInfo.video_ext || 'mp4'}`,
                size: size,
                type: 'video/mp4',
                lastModified: Date.now(),
                isStream: true,
                originalUrl: url,
                streamingUrl: streamingUrl,
                width: width,
                height: height,
                duration: duration,
                fps: fps,
                vcodec: normalizeCodec(videoInfo.vcodec) || normalizeCodec(videoInfo.format_note),
                acodec: normalizeCodec(videoInfo.acodec),
                container: videoInfo.ext || videoInfo.video_ext || 'mp4',
                tbr: videoInfo.tbr,
                vbr: videoInfo.vbr,
                abr: videoInfo.abr
            };
            
            if (streamingUrl.includes('.m3u8')) {
                showError('.m3u8 playlists not yet supported');
            } else {
                video.src = streamingUrl;
                video.focus();
                dropzone.setAddMedia(false);
                
                const videoLoadEvent = new CustomEvent('videoFileLoaded', { 
                    detail: { file: virtualFile } 
                });
                
                video.addEventListener('loadedmetadata', async () => {
                    if (!virtualFile.width && video.videoWidth) virtualFile.width = video.videoWidth;
                    if (!virtualFile.height && video.videoHeight) virtualFile.height = video.videoHeight;
                    if (!virtualFile.duration && video.duration) virtualFile.duration = video.duration;
                    
                    await metadata.updateMetadataDisplay(virtualFile);
                    video.dispatchEvent(videoLoadEvent);
                }, { once: true });
            }
            
            return true;
        } catch (error) {
            console.error('Failed to load video from URL:', error);
            showError('Failed to load video from URL');
            return false;
        } finally {
            loadUrlButton.disabled = false;
            loadUrlButton.textContent = 'Load';
            loadUrlButton.style.pointerEvents = '';
            urlInput.disabled = false;
        }
    };
    
    const init = () => {
        const urlInputContainer = $('.url-input-container');
        const urlInput = $('#videoUrlInput');
        
        urlInput.setAttribute('autocomplete', 'off');
        
        const getRecentEntries = () => {
            const stored = localStorage.getItem('recentVideoEntries');
            return stored ? JSON.parse(stored) : [];
        };
        
        const saveRecentEntry = (url, title) => {
            let recent = getRecentEntries();
            recent = recent.filter(entry => entry.url !== url);
            recent.unshift({ url, title: title || url });
            recent = recent.slice(0, 5);
            localStorage.setItem('recentVideoEntries', JSON.stringify(recent));
        };
        
        const datalist = document.createElement('datalist');
        datalist.id = 'url-suggestions';
        urlInput.setAttribute('list', 'url-suggestions');
        urlInput.parentNode.appendChild(datalist);
        
        const updateSuggestions = () => {
            datalist.innerHTML = '';
            getRecentEntries().forEach(entry => {
                const option = document.createElement('option');
                option.value = entry.url;
                option.label = entry.title;
                datalist.appendChild(option);
            });
        };
        
        updateSuggestions();
        
        let isSelecting = false;
        
        urlInput.addEventListener('input', (e) => {
            if (isSelecting) {
                isSelecting = false;
                return;
            }
            
            const entries = getRecentEntries();
            const matchedEntry = entries.find(entry => 
                entry.title === e.target.value || entry.url === e.target.value
            );
            
            if (matchedEntry && e.target.value === matchedEntry.title) {
                isSelecting = true;
                e.target.value = matchedEntry.url;
            }
        });

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