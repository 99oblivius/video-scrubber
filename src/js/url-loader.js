const { invoke } = window.__TAURI__.core;

export const setupUrlLoader = (video, dropContainer, metadata, dropzone) => {
    const $ = document.querySelector.bind(document);
    const urlInput = $('#videoUrlInput');
    const loadUrlButton = $('#loadUrlButton');
    const searchSpinner = $('#urlSearchSpinner');
    
    let searchDebounceTimer = null;
    let currentSearchRequest = null;
    let isSelectingResult = false;
    let isSearching = false;
    
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
    
    const showSearchSpinner = () => {
        isSearching = true;
        searchSpinner.classList.add('active');
        urlInput.classList.add('searching');
    };
    
    const hideSearchSpinner = () => {
        isSearching = false;
        searchSpinner.classList.remove('active');
        urlInput.classList.remove('searching');
    };
    
    const getRecentEntries = () => {
        const stored = localStorage.getItem('recentVideoEntries');
        return stored ? JSON.parse(stored) : [];
    };

    const saveRecentEntry = (url, title) => {
        let normalized;
        try {
            normalized = new URL(url).href;
        } catch {
            normalized = url.trim();
        }

        const entry = { url: normalized, title: title || normalized };
        let recent = getRecentEntries().filter(e => e.url !== entry.url);

        recent.unshift(entry);
        recent = recent.slice(0, 10);
        localStorage.setItem('recentVideoEntries', JSON.stringify(recent));
    };
    
    const loadVideoFromUrl = async (url) => {
        try {
            loadUrlButton.disabled = true;
            loadUrlButton.textContent = 'Loading...';
            urlInput.disabled = true;
            
            const { urls: streamingUrls, info: videoInfo } = await invoke('get_streaming_url', { 
                url, 
                format_preference: 'bv[height<=1080]*+ba/b' 
            });

            const lastFormat = videoInfo.formats?.[videoInfo.formats.length - 1];

            const width = lastFormat?.width ?? videoInfo.width;
            const height = lastFormat?.height ?? videoInfo.height;
            const fps = lastFormat?.fps ?? videoInfo.fps;
            
            const duration = videoInfo.duration || 0;
            const size = videoInfo.filesize || videoInfo.filesize_approx || 0;
            const title = videoInfo.title || 'Unknown Title';
            
            let safeTitle = window.makeSafeFileName(title);
            document.title = safeTitle;
            await invoke('update_window_title', { title: `Livideo - "${safeTitle}"` });
            saveRecentEntry(url, title);
            updateHistorySuggestions();

            urlInput.value = "";

            const ext = videoInfo.ext || videoInfo.video_ext || 'mp4';
            
            const virtualFile = {
                path: url,
                name: `${makeSafeFileName(safeTitle)}.${ext}`,
                size: size,
                type: `video/${ext}`,
                lastModified: Date.now(),
                isStream: true,
                originalUrl: url,
                streamingUrls: streamingUrls,
                width: width,
                height: height,
                duration: duration,
                fps: fps,
                vcodec: normalizeCodec(videoInfo.vcodec) || 
                    normalizeCodec(videoInfo.format_note),
                acodec: normalizeCodec(videoInfo.acodec),
                container: videoInfo.ext || videoInfo.video_ext || 'mp4',
                tbr: videoInfo.tbr,
                vbr: videoInfo.vbr,
                abr: videoInfo.abr
            };
            
            console.info(virtualFile);
            video.innerHTML = '';
            
            streamingUrls.forEach(function (stream) {
                const element = document.createElement('source');
                element.src = stream;
                video.appendChild(element);
            });
            
            dropzone.setAddMedia(false);
            
            await metadata.updateMetadataDisplay(virtualFile);
            
            const videoLoadEvent = new CustomEvent('videoFileLoaded', { 
                detail: { file: virtualFile } 
            });
            video.dispatchEvent(videoLoadEvent);
            
            video.load();
            video.focus();
            
            return true;
        } catch (error) {
            window.showNotification("Failed to load video from URL", "error");
            console.error(error);
            return false;
        } finally {
            loadUrlButton.disabled = false;
            loadUrlButton.textContent = 'Load';
            loadUrlButton.style.pointerEvents = '';
            urlInput.disabled = false;
        }
    };
    
    const createSuggestionItem = (data, isHistory = false) => {
        const option = document.createElement('option');
        
        if (isHistory) {
            option.value = data.url;
            option.textContent = data.title;
            option.dataset.url = data.url;
            option.dataset.isHistory = 'true';
        } else {
            option.value = data.title;
            option.textContent = data.title;
            option.dataset.url = data.url;
            
            const duration = data.duration_string || '';
            const uploader = data.uploader || '';
            const parts = [];
            if (duration) parts.push(duration);
            if (uploader) parts.push(uploader);
            
            if (parts.length > 0) {
                option.label = parts.join(' • ');
            }
        }
        
        return option;
    };
    
    const clearSuggestions = () => {
        const datalist = document.getElementById('url-suggestions');
        datalist.innerHTML = '';
    };
    
    const updateHistorySuggestions = () => {
        const datalist = document.getElementById('url-suggestions');
        datalist.innerHTML = '';
        
        getRecentEntries().forEach(entry => {
            datalist.appendChild(createSuggestionItem(entry, true));
        });
    };
    
    const performSearch = async (query) => {
        if (!query || query.length < 2) {
            hideSearchSpinner();
            updateHistorySuggestions();
            return;
        }
        
        try {
            new URL(query);
            hideSearchSpinner();
            clearSuggestions();
            return;
        } catch {
        }
        
        currentSearchRequest = query;
        showSearchSpinner();
        
        try {
            const results = await invoke('search_youtube', { query });
            
            if (currentSearchRequest === query) {
                const datalist = document.getElementById('url-suggestions');
                datalist.innerHTML = '';
                
                results.forEach(result => {
                    datalist.appendChild(createSuggestionItem(result, false));
                });
            }
        } catch (error) {
            console.error('Search failed:', error);
            window.showNotification("YtSearch failed", "error");
        } finally {
            if (currentSearchRequest === query) {
                hideSearchSpinner();
            }
        }
    };
    
    const init = () => {
        urlInput.setAttribute('autocomplete', 'off');
        
        const datalist = document.createElement('datalist');
        datalist.id = 'url-suggestions';
        urlInput.setAttribute('list', 'url-suggestions');
        urlInput.parentNode.appendChild(datalist);
        
        updateHistorySuggestions();
        
        urlInput.addEventListener('focus', () => {
            if (!urlInput.value.trim() && !isSearching) {
                updateHistorySuggestions();
            }
        });
        
        urlInput.addEventListener('input', (e) => {
            if (isSelectingResult) {
                isSelectingResult = false;
                return;
            }
            
            const value = e.target.value.trim();
            
            const datalist = document.getElementById('url-suggestions');
            const options = Array.from(datalist.options);
            const selectedOption = options.find(opt => 
                opt.value === value || opt.textContent === value
            );
            
            if (selectedOption && selectedOption.dataset.url) {
                isSelectingResult = true;
                e.target.value = selectedOption.dataset.url;
                hideSearchSpinner();
                return;
            }
            
            if (searchDebounceTimer) {
                clearTimeout(searchDebounceTimer);
            }
            
            currentSearchRequest = null;
            hideSearchSpinner();
            
            if (!value) {
                updateHistorySuggestions();
                return;
            }
            
            clearSuggestions();
            
            searchDebounceTimer = setTimeout(() => {
                performSearch(value);
            }, 2000);
        });
        
        loadUrlButton.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (!url) {
                window.showNotification("Please enter a valid URL", "error");
                return;
            }
            
            if (searchDebounceTimer) {
                clearTimeout(searchDebounceTimer);
                hideSearchSpinner();
            }
            
            loadVideoFromUrl(url);
        });
        
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (searchDebounceTimer) {
                    clearTimeout(searchDebounceTimer);
                    hideSearchSpinner();
                }
                loadUrlButton.click();
            }
        });
    };
    
    return {
        init,
        loadVideoFromUrl
    };
};