const getCurrentWindow = window.__TAURI__.window.getCurrentWindow;

export const setupControls = (video, frameTime, settings) => {
    const $ = document.querySelector.bind(document);
    const volumeIndicator = $('#volumeIndicator');
    const volumeText = $('#volumeText');
    const loopBtn = $('#loopBtn');
    const themeBtn = $('#themeBtn');
    let volumeTimeout;

    const updateVolumeUI = () => {
        const vol = Math.round(video.volume * 100);
        volumeText.textContent = `${vol}%`;
        volumeIndicator.style.opacity = '1';
        clearTimeout(volumeTimeout);
        volumeTimeout = setTimeout(() => volumeIndicator.style.opacity = '0', 500);
    };

    const changeVolume = (delta) => {
        video.volume = Math.max(0, Math.min(1, video.volume + delta));
        settings.set('volume', video.volume);
        updateVolumeUI();
    };

    const togglePlayPause = () => video.paused ? video.play() : video.pause();
    const stepForward = () => {video.pause(); video.currentTime = Math.min(video.duration || 0, (video.currentTime || 0) + frameTime);};
    const stepBackward = () => {video.pause(); video.currentTime = Math.max(0, (video.currentTime || 0) - frameTime);};
    const jumpForward = () => {video.pause(); video.currentTime = Math.min(video.duration || 0, (video.currentTime || 0) + 1);};
    const jumpBackward = () => {video.pause(); video.currentTime = Math.max(0, (video.currentTime || 0) - 1);};
    const jumpToPercent = p => { if (video.duration) video.currentTime = video.duration * p; };

    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        settings.set('theme', newTheme);
        themeBtn.textContent = newTheme === 'light' ? '🌙' : '☀️';
    };

    const toggleFullscreen = () => {
        const appWindow = getCurrentWindow();
        appWindow.isFullscreen().then((state) => {
            if (state) {
                document.exitFullscreen();
                appWindow.setFullscreen(false);
            } else {
                video.parentElement.requestFullscreen();
                appWindow.setFullscreen(true);
            }
        });
    };

    const toggleLoop = () => {
        video.loop = !video.loop;
        loopBtn.classList.toggle('active');
        settings.set('loop', video.loop);
    };

    const bindButtons = () => {
        const buttonRow = $('.button-row');
        const [
            jumpBackBtn,
            prevFrameBtn,
            playPauseBtn,
            nextFrameBtn,
            jumpForwardBtn
        ] = buttonRow.children;

        jumpBackBtn.onmousedown = jumpBackward;
        prevFrameBtn.onmousedown = stepBackward;
        playPauseBtn.onmousedown = togglePlayPause;
        nextFrameBtn.onmousedown = stepForward;
        jumpForwardBtn.onmousedown = jumpForward;

        const updatePlayPauseText = () => {
            playPauseBtn.textContent = video.paused ? '▶' : '❚❚';
        };
        
        video.addEventListener('play', updatePlayPauseText);
        video.addEventListener('pause', updatePlayPauseText);
        updatePlayPauseText();
    };

    const toggleTooltip = () => {
        tooltip.classList.toggle('active');
        helpBtn.classList.toggle('active');
    };

    const setupKeyboardShortcuts = () => {
        document.addEventListener('keydown', e => {
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
                default:
                    if (e.key >= '0' && e.key <= '9') {
                        jumpToPercent(Number(e.key) / 10);
                    }
                    return;
            }
            e.preventDefault();
        });
    };

    const init = () => {
        video.addEventListener('click', togglePlayPause);
        loopBtn.addEventListener('click', toggleLoop);
        themeBtn.addEventListener('click', toggleTheme);
        setupKeyboardShortcuts();

        bindButtons();
        
        document.addEventListener('contextmenu', event => event.preventDefault());
        window.addEventListener('wheel', (e) => {
            if (e.ctrlKey) return;
            e.preventDefault();
            changeVolume(e.deltaY > 0 ? -0.05 : 0.05);
        }, { passive: false });
    };

    return {
        init,
        togglePlayPause,
        stepForward,
        stepBackward,
        jumpForward,
        jumpBackward
    };
};