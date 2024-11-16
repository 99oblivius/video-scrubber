export const setupProgressBar = (video) => {
    const $ = document.querySelector.bind(document);
    const progressFill = $('#progressFill');
    const progressHandle = $('#progressHandle');
    const progressContainer = $('#progressContainer');
    const progressHoverTime = $('#progressHoverTime');
    let frameTime = 1/30;

    const updateProgress = () => {
        if (video.duration) {
            const progress = (video.currentTime / video.duration) * 100;
            progressFill.style.width = `${progress}%`;
            progressHandle.style.left = `${progress}%`;
        }
    };

    const setProgress = (e) => {
        if (!video.duration) return;
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        video.currentTime = video.duration * Math.max(0, Math.min(1, pos));
    };

    const showHoverTime = (e) => {
        if (!video.duration) return;
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const time = video.duration * Math.max(0, Math.min(1, pos));
        progressHoverTime.textContent = `${time.toFixed(3)}s (Frame ${Math.floor(time/frameTime)})`;
        progressHoverTime.style.left = `${e.clientX}px`;
        progressHoverTime.style.top = `${rect.y - 35}px`;
        progressHoverTime.style.opacity = '1';
    };

    const updateTimeDisplay = () => {
        const timeDisplay = $('#timeDisplay');
        const frameDisplay = $('#frameDisplay');
        if (timeDisplay && frameDisplay) {
            timeDisplay.textContent = video.currentTime.toFixed(3);
            frameDisplay.textContent = Math.floor(video.currentTime / frameTime);
        }
        updateProgress();
        requestAnimationFrame(updateTimeDisplay);
    };

    const init = () => {
        progressContainer.addEventListener('mousemove', (e) => {
            if (e.buttons === 0) {
                showHoverTime(e);
            }
        });

        progressContainer.addEventListener('mouseleave', (e) => {
            if (e.buttons === 0) {
                progressHoverTime.style.opacity = '0';
            }
        });

        progressContainer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            setProgress(e);
            showHoverTime(e);

            const handleDrag = (e) => {
                setProgress(e);
                showHoverTime(e);
            };

            const handleDragEnd = () => {
                document.removeEventListener('mousemove', handleDrag);
                document.removeEventListener('mouseup', handleDragEnd);
                progressHoverTime.style.opacity = '0';
            };

            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', handleDragEnd);
        });
    };

    return {
        init,
        updateTimeDisplay,
        updateProgress
    };
};