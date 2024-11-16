const player = (() => {
    const $ = document.querySelector.bind(document);
    const v = $('#video');
    const dc = $('#dropContainer');
    const dropError = $('#dropError');
    const timeDisplay = $('#timeDisplay');
    const frameDisplay = $('#frameDisplay');
    const volumeIndicator = $('#volumeIndicator');
    const volumeText = $('#volumeText');
    const progressFill = $('#progressFill');
    const progressHandle = $('#progressHandle');
    const progressContainer = $('#progressContainer');
    const progressHoverTime = $('#progressHoverTime');
    const loopBtn = $('#loopBtn');
    const fpsDisplay = $('#fpsDisplay');

    const settings = VideoPlayerSettings;

    let frameTime = 1/30, lastUpdate = 0, volumeTimeout;

    const updateVolumeUI = () => {
        const vol = Math.round(v.volume * 100);
        volumeText.textContent = `${vol}%`;
        volumeIndicator.style.opacity = '1';
        clearTimeout(volumeTimeout);
        volumeTimeout = setTimeout(() => volumeIndicator.style.opacity = '0', 500);
    };

    const changeVolume = (delta) => {
        v.volume = Math.max(0, Math.min(1, v.volume + delta));
        settings.set('volume', v.volume);
        updateVolumeUI();
    };

    const updateTimeDisplay = () => {
        timeDisplay.textContent = v.currentTime.toFixed(3);
        frameDisplay.textContent = Math.floor(v.currentTime / frameTime);
        updateProgress();
        requestAnimationFrame(updateTimeDisplay);
    };

    const updateProgress = () => {
        if (v.duration) {
            const progress = (v.currentTime / v.duration) * 100;
            progressFill.style.width = `${progress}%`;
            progressHandle.style.left = `${progress}%`;
        }
    };

    const setProgress = (e) => {
        if (!v.duration) return;
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        v.currentTime = v.duration * Math.max(0, Math.min(1, pos));
    };

    const showHoverTime = (e) => {
        if (!v.duration) return;
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const time = v.duration * Math.max(0, Math.min(1, pos));
        progressHoverTime.textContent = `${time.toFixed(3)}s (Frame ${Math.floor(time/frameTime)})`;
        progressHoverTime.style.left = `${e.clientX - rect.left}px`;
        progressHoverTime.style.opacity = '1';
    };

    const showDropError = (message) => {
        dropError.textContent = message;
        dropError.style.opacity = '1';
        setTimeout(() => dropError.style.opacity = '0', 3000);
    };

    const loadVideo = file => {
        v.src = URL.createObjectURL(file);
        v.focus();
        dc.classList.remove('no-video');
        detectFrameRate();
    };

    const detectFrameRate = () => {
        v.addEventListener('loadedmetadata', () => {
            if (v.getVideoPlaybackQuality) {
                const q = v.getVideoPlaybackQuality();
                if (q.totalVideoFrames > 0) {
                    frameTime = v.duration / q.totalVideoFrames;
                    fpsDisplay.textContent = `${(1/frameTime).toFixed(3)} FPS`;
                    return;
                }
            }
            fpsDisplay.textContent = '';
        }, {once: true});
    };

    const togglePlayPause = () => v.paused ? v.play() : v.pause();
    const stepForward = () => {v.pause(); v.currentTime = Math.min(v.duration || 0, (v.currentTime || 0) + frameTime);};
    const stepBackward = () => {v.pause(); v.currentTime = Math.max(0, (v.currentTime || 0) - frameTime);};
    const jumpForward = () => {v.pause(); v.currentTime = Math.min(v.duration || 0, (v.currentTime || 0) + 1);};
    const jumpBackward = () => {v.pause(); v.currentTime = Math.max(0, (v.currentTime || 0) - 1);};
    const jumpToPercent = p => { if (v.duration) v.currentTime = v.duration * p; };

    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else dc.requestFullscreen();
    };

    const toggleLoop = () => {
        v.loop = !v.loop;
        loopBtn.classList.toggle('active');
        settings.set('loop', v.loop);
    };

    const setupEventListeners = () => {
        v.addEventListener('click', togglePlayPause);

        window.addEventListener('wheel', (e) => {
            if (e.ctrlKey) return;
            e.preventDefault();
            changeVolume(e.deltaY > 0 ? -0.05 : 0.05);
        }, { passive: false });

        progressContainer.addEventListener('mousemove', showHoverTime);
        progressContainer.addEventListener('mouseleave', () => progressHoverTime.style.opacity = '0');
        progressContainer.addEventListener('mousedown', (e) => {
            setProgress(e);
            const onMove = (e) => setProgress(e);
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        dc.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            dc.classList.add('drop-active');
        });

        dc.addEventListener('dragleave', e => {
            e.preventDefault();
            e.stopPropagation();
            dc.classList.remove('drop-active');
        });

        dc.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            dc.classList.remove('drop-active');
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

        loopBtn.addEventListener('click', toggleLoop);

        document.addEventListener('keydown', e => {
            if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
            switch(e.code) {
                case 'Space': togglePlayPause(); break;
                case 'ArrowLeft': jumpBackward(); break;
                case 'ArrowRight': jumpForward(); break;
                case 'ArrowUp': changeVolume(0.05); break;
                case 'ArrowDown': changeVolume(-0.05); break;
                case 'Comma': stepBackward(); break;
                case 'Period': stepForward(); break;
                case 'KeyF': toggleFullscreen(); break;
                case 'KeyL': toggleLoop(); break;
                case 'KeyT': toggleTheme(); break;
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

        const tooltip = $('#tooltip');
        const helpBtn = $('#helpBtn');
        const toggleHelp = () => {
            tooltip.classList.toggle('active');
            helpBtn.classList.toggle('active');
        };

        helpBtn.onclick = toggleHelp;
        document.addEventListener('click', e => {
            if (!tooltip.contains(e.target) && !helpBtn.contains(e.target)) {
                tooltip.classList.remove('active');
                helpBtn.classList.remove('active');
            }
        });

        const themeBtn = $('#themeBtn');
        const toggleTheme= () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light'
            document.documentElement.setAttribute('data-theme', newTheme);
            themeBtn.textContent = newTheme === 'light' ? '🌙' : '☀️';
            settings.set('theme', newTheme);
        };

        themeBtn.onclick = () => {
            toggleTheme();
        };

        document.querySelectorAll('button, video, .progress-container').forEach(el => {
            el.addEventListener('mousedown', e => e.preventDefault());
        });
    };

    const showInitialHelpTip = () => {
        if (!settings.get('hasSeenHelpTip')) {
            const helpTip = $('#helpTip');
            helpTip.classList.add('show');
    
            const hideOnH = (e) => {
                if (e.code === 'KeyH') {
                    helpTip.classList.remove('show');
                    settings.set('hasSeenHelpTip', true);
                    document.removeEventListener('keydown', hideOnH);
                }
            };
            document.addEventListener('keydown', hideOnH);
        }
    };

    const init = () => {
        settings.apply();
        setupEventListeners();
        requestAnimationFrame(updateTimeDisplay);
        showInitialHelpTip();  // Add this line
    };

    return { togglePlayPause, stepForward, stepBackward, jumpForward, jumpBackward, init };
})();

document.addEventListener('DOMContentLoaded', player.init);