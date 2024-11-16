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

    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else video.parentElement.requestFullscreen();
    };

    const toggleLoop = () => {
        video.loop = !video.loop;
        loopBtn.classList.toggle('active');
        settings.set('loop', video.loop);
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
                case 'KeyT': settings.toggleTheme(); break;
                case 'KeyH': 
                    tooltip.classList.toggle('active');
                    helpBtn.classList.toggle('active');
                    break;
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
        themeBtn.addEventListener('click', settings.toggleTheme);
        setupKeyboardShortcuts();

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