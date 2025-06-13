const getCurrentWindow = window.__TAURI__.window.getCurrentWindow;

export const setupControls = (video, metadata, settings, dropzone) => {
    const $ = document.querySelector.bind(document);
    const loopBtn = $('#loopBtn');
    const themeBtn = $('#themeBtn');
    const volumeIndicator = $('#volumeIndicator');
    const volumeText = $('#volumeText');
    const volumeIcon = $('#volumeIcon');
    
    let muteVolume = false;
    let volumeTimeout;

    const updateVolumeUI = () => {
        const vol = Math.round(video.volume * 100);
        volumeText.textContent = `${vol}%`;
        volumeIcon.src = muteVolume ? '/assets/icons/mute-volume.svg' : '/assets/icons/volume.svg';
        volumeIndicator.style.opacity = '1';
        clearTimeout(volumeTimeout);
        volumeTimeout = setTimeout(() => volumeIndicator.style.opacity = '0', 500);
    };

    const changeVolume = (delta) => {
        video.volume = Math.max(0, Math.min(1, video.volume + delta));
        settings.set('volume', video.volume);
        updateVolumeUI();
    };

    const toggleMute = () => {
        video.muted = !video.muted;
        muteVolume = video.muted;
        updateVolumeUI();
    };

    const togglePlayPause = () => video.paused ? video.play() : video.pause();
    const stepForward = () => {
        video.pause();
        video.currentTime = Math.min(video.duration || 0, (video.currentTime || 0) + metadata.getFrameTime());
    };
    const stepBackward = () => {
        video.pause();
        video.currentTime = Math.max(0, (video.currentTime || 0) - metadata.getFrameTime());
    };
    const jumpForward = () => {
        video.currentTime = Math.min(video.duration || 0, (video.currentTime || 0) + 1);
    };
    const jumpBackward = () => {
        video.currentTime = Math.max(0, (video.currentTime || 0) - 1);
    };
    const jumpToPercent = p => {
        if (video.duration) video.currentTime = video.duration * p;
    };

    const openMedia = () => {
        if (video.src) dropzone.setAddMedia();
    };

    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        settings.set('theme', newTheme);
        themeBtn.textContent = newTheme === 'light' ? '☀️' : '🌙';
    };

    const toggleLoop = () => {
        video.loop = !video.loop;
        loopBtn.classList.toggle('active');
        settings.set('loop', video.loop);
    };

    const toggleTooltip = () => {
        tooltip.classList.toggle('active');
        helpBtn.classList.toggle('active');
    };

    const toggleFullscreen = (onlyExit) => {
        const appWindow = getCurrentWindow();
        appWindow.isFullscreen().then((state) => {
            if (state || onlyExit) {
                document.exitFullscreen();
                appWindow.setFullscreen(false);
            } else {
                video.parentElement.requestFullscreen();
                appWindow.setFullscreen(true);
            }
        });
    };

    const bindButtons = () => {
        const buttonRow = $('.button-row');
        const [openMediaBtn, jumpBackBtn, playPauseBtn, jumpForwardBtn] = buttonRow.children;
        
        const updatePlayPauseText = () => { playPauseBtn.textContent = video.paused ? '▶' : '❚❚'; };
        
        let openMediaTimeout;
        openMediaBtn.addEventListener('click', (e) => {
            if (e.button === 0) {
                clearTimeout(openMediaTimeout);
                openMediaTimeout = setTimeout(() => openMedia(), 500);
            }
        });
        openMediaBtn.addEventListener('dblclick', (e) => {
            clearTimeout(openMediaTimeout);
            dropzone.openVideoFile();
        });
        
        jumpBackBtn.addEventListener('click', (e) => { if (e.button === 0) jumpBackward(); });
        playPauseBtn.addEventListener('click', (e) => { if (e.button === 0) togglePlayPause(); });
        jumpForwardBtn.addEventListener('click', (e) => { if (e.button === 0) jumpForward(); });
        
        video.addEventListener('play', updatePlayPauseText);
        video.addEventListener('pause', updatePlayPauseText);
        updatePlayPauseText();
    };

    const setupKeyboardShortcuts = () => {
        let openMediaTimeout;
        let lastCtrlOTime = 0;

        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
                e.preventDefault();
                
                const currentTime = Date.now();
                const timeSinceLastCtrlO = currentTime - lastCtrlOTime;
                lastCtrlOTime = currentTime;
                
                if (timeSinceLastCtrlO < 500) {
                    clearTimeout(openMediaTimeout);
                    dropzone.openVideoFile();
                } else {
                    clearTimeout(openMediaTimeout);
                    openMediaTimeout = setTimeout(() => openMedia(), 500);
                }
                return;
            }
            
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                if (e.code === 'Escape') e.target.blur();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'p') e.preventDefault();
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            
            switch(e.code) {
                case 'ArrowLeft': jumpBackward(); break;
                case 'ArrowRight': jumpForward(); break;
                case 'ArrowUp': changeVolume(0.05); break;
                case 'ArrowDown': changeVolume(-0.05); break;
                case 'Comma': stepBackward(); break;
                case 'Period': stepForward(); break;
                default: break;
            }
            
            if (e.repeat) return;
            
            switch(e.code) {
                case 'Space': togglePlayPause(); break;
                case 'KeyF': toggleFullscreen(); break;
                case 'KeyL': toggleLoop(); break;
                case 'KeyT': toggleTheme(); break;
                case 'KeyH': toggleTooltip(); break;
                case 'KeyM': toggleMute(); break;
                default:
                    if (e.key >= '0' && e.key <= '9') jumpToPercent(Number(e.key) / 10);
                    return;
            }
            e.preventDefault();
        });
        
        video.addEventListener('dblclick', e => {
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            toggleFullscreen();
        });
    };

    const setupFullscreenHandling = () => {
        document.addEventListener('fullscreenchange', async () => {
            const appWindow = getCurrentWindow();
            const isFullscreen = !!document.fullscreenElement;
            await appWindow.setFullscreen(isFullscreen);
        });

        window.addEventListener('keydown', async (e) => {
            if (e.key === 'Escape') {
                const appWindow = getCurrentWindow();
                const isFullscreen = await appWindow.isFullscreen();
                if (isFullscreen) {
                    e.preventDefault();
                    e.stopPropagation();
                    document.exitFullscreen();
                    appWindow.setFullscreen(false);
                }
            }
        }, true);
    };

    const init = () => {
        video.addEventListener('click', togglePlayPause);
        loopBtn.addEventListener('click', toggleLoop);
        themeBtn.addEventListener('click', toggleTheme);
        document.addEventListener('contextmenu', event => event.preventDefault());
        window.addEventListener('wheel', (e) => {
            if (e.ctrlKey) return;
            if (e.target.closest('.time-display')) return;
            e.preventDefault();
            changeVolume(e.deltaY > 0 ? -0.05 : 0.05);
        }, { passive: false });
        
        bindButtons();
        setupKeyboardShortcuts();
        setupFullscreenHandling();
    };

    return { init, togglePlayPause, jumpForward, jumpBackward };
};