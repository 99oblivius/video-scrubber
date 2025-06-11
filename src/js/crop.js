export const setupCrop = (video, settings) => {
    const $ = document.querySelector.bind(document);
    const crop = $('#crop'), cropBtn = $('#crop-button'), videoWrapper = $('.video-wrapper');
    const state = { relative: { x: 0.5, y: 0.5, width: 0, height: 0 } };
    const RATIOS = [
        { value: 'custom', label: 'Custom' },
        { value: '1:1', label: '1:1' },
        { value: '16:9', label: '16:9' },
        { value: '4:3', label: '4:3' }
    ];

    const getDims = () => {
        const rect = video.getBoundingClientRect();
        const vRatio = video.videoWidth / video.videoHeight;
        const cRatio = rect.width / rect.height;
        const style = window.getComputedStyle(videoWrapper);
        const pad = { left: parseFloat(style.paddingLeft), top: parseFloat(style.paddingTop) };
        let d = { width: 0, height: 0, xOffset: pad.left, yOffset: pad.top, scale: 0 };
        if (vRatio > cRatio) {
            d.width = rect.width;
            d.height = d.width / vRatio;
            d.yOffset += (rect.height - d.height) / 2;
        } else {
            d.height = rect.height;
            d.width = d.height * vRatio;
            d.xOffset += (rect.width - d.width) / 2;
        }
        d.scale = d.width / video.videoWidth;
        return d;
    };

    const calcCrop = (ratio, preservePos = false) => {
        if (!video.videoWidth) return null;
        if (ratio === 'custom') {
            if (!state.relative.width && !state.relative.height) {
                state.relative = { x: 0.5, y: 0.5, width: 1, height: 1 };
            }
            const d = {
                width: Math.round(video.videoWidth * state.relative.width),
                height: Math.round(video.videoHeight * state.relative.height),
                x: Math.round(video.videoWidth * state.relative.x - (video.videoWidth * state.relative.width) / 2),
                y: Math.round(video.videoHeight * state.relative.y - (video.videoHeight * state.relative.height) / 2)
            };
            Object.keys(d).forEach(k => d[k] = d[k] % 2 ? d[k] - 1 : d[k]);
            return d;
        }
        const [w, h] = ratio.split(':').map(Number);
        const isVert = settings.get('cropOrientation') === 'vertical';
        const tRatio = isVert ? h / w : w / h;
        const cRatio = video.videoWidth / video.videoHeight;
        let width, height;
        if (tRatio > cRatio) {
            width = video.videoWidth;
            height = Math.round(width / tRatio);
        } else {
            height = video.videoHeight;
            width = Math.round(height * tRatio);
        }
        width = width % 2 ? width - 1 : width;
        height = height % 2 ? height - 1 : height;
        
        if (!preservePos || (!state.relative.width && !state.relative.height)) {
            state.relative = { x: 0.5, y: 0.5, width: width / video.videoWidth, height: height / video.videoHeight };
        }
        
        const centerX = Math.round(video.videoWidth * state.relative.x);
        const centerY = Math.round(video.videoHeight * state.relative.y);
        const x = Math.round(centerX - width / 2);
        const y = Math.round(centerY - height / 2);
        
        const boundedX = Math.max(0, Math.min(video.videoWidth - width, x));
        const boundedY = Math.max(0, Math.min(video.videoHeight - height, y));
        
        return { 
            width, 
            height, 
            x: boundedX % 2 ? boundedX - 1 : boundedX, 
            y: boundedY % 2 ? boundedY - 1 : boundedY 
        };
    };

    const updateOverlay = () => {
        const overlay = $('.crop-overlay');
        if (!overlay) return;
        const dims = calcCrop($('#ratio-select').value, true);
        if (!dims) return;
        window.cropSettings = dims;
        const dDims = getDims();
        requestAnimationFrame(() => {
            Object.assign(overlay.style, {
                width: `${Math.round(dims.width * dDims.scale)}px`,
                height: `${Math.round(dims.height * dDims.scale)}px`,
                left: `${Math.round(dDims.xOffset + dims.x * dDims.scale)}px`,
                top: `${Math.round(dDims.yOffset + dims.y * dDims.scale)}px`
            });
        });
    };

    const handleCornerDrag = (e, corner) => {
        e.stopPropagation();
        const overlay = $('.crop-overlay');
        const isCustom = $('#ratio-select').value === 'custom';
        const dDims = getDims();
        const iMouse = { x: e.clientX, y: e.clientY };
        const iRect = {
            left: parseFloat(overlay.style.left),
            top: parseFloat(overlay.style.top),
            width: parseFloat(overlay.style.width),
            height: parseFloat(overlay.style.height)
        };

        const handleDrag = (e) => {
            const delta = { x: e.clientX - iMouse.x, y: e.clientY - iMouse.y };
            const bounds = {
                minX: dDims.xOffset,
                minY: dDims.yOffset,
                maxX: dDims.xOffset + dDims.width,
                maxY: dDims.yOffset + dDims.height
            };
            let nDims = { ...iRect };

            if (isCustom) {
                const isLeft = corner.includes('l'), isTop = corner.includes('t');
                if (isLeft) {
                    nDims.left = Math.max(bounds.minX, Math.min(iRect.left + iRect.width - 16 * dDims.scale, iRect.left + delta.x));
                    nDims.width = iRect.width - (nDims.left - iRect.left);
                } else {
                    nDims.width = Math.max(16 * dDims.scale, Math.min(bounds.maxX - iRect.left, iRect.width + delta.x));
                }
                if (isTop) {
                    nDims.top = Math.max(bounds.minY, Math.min(iRect.top + iRect.height - 16 * dDims.scale, iRect.top + delta.y));
                    nDims.height = iRect.height - (nDims.top - iRect.top);
                } else {
                    nDims.height = Math.max(16 * dDims.scale, Math.min(bounds.maxY - iRect.top, iRect.height + delta.y));
                }
            } else {
                nDims.left = Math.max(bounds.minX, Math.min(bounds.maxX - overlay.offsetWidth, iRect.left + delta.x));
                nDims.top = Math.max(bounds.minY, Math.min(bounds.maxY - overlay.offsetHeight, iRect.top + delta.y));
            }

            Object.assign(overlay.style, {
                left: `${Math.round(nDims.left)}px`,
                top: `${Math.round(nDims.top)}px`,
                width: isCustom ? `${Math.round(nDims.width)}px` : overlay.style.width,
                height: isCustom ? `${Math.round(nDims.height)}px` : overlay.style.height
            });

            const xInVid = Math.round((nDims.left - dDims.xOffset) / dDims.scale);
            const yInVid = Math.round((nDims.top - dDims.yOffset) / dDims.scale);
            const wInVid = Math.round(nDims.width / dDims.scale);
            const hInVid = Math.round(nDims.height / dDims.scale);

            state.relative = {
                x: (xInVid + wInVid/2) / video.videoWidth,
                y: (yInVid + hInVid/2) / video.videoHeight,
                width: wInVid / video.videoWidth,
                height: hInVid / video.videoHeight
            };

            window.cropSettings = { x: xInVid, y: yInVid, width: wInVid, height: hInVid };
        };

        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', () => {
            document.removeEventListener('mousemove', handleDrag);
        }, { once: true });
    };

    const createOverlay = () => {
        if ($('.crop-overlay')) return;
        const overlay = document.createElement('div');
        overlay.className = 'crop-overlay';
        ['tl', 'tr', 'bl', 'br'].forEach(corner => {
            const handle = document.createElement('div');
            handle.className = `crop-handle ${corner}`;
            handle.addEventListener('mousedown', e => handleCornerDrag(e, corner));
            overlay.appendChild(handle);
        });
        video.insertAdjacentElement('afterend', overlay);
    };

    const setupUI = () => {
        const select = $('#ratio-select');
        select.innerHTML = RATIOS.map(r => `<option value="${r.value}">${r.label}</option>`).join('');
        select.value = settings.get('cropAspectRatio') || '16:9';
        select.addEventListener('change', () => {
            settings.set('cropAspectRatio', select.value);
            state.relative = { x: 0.5, y: 0.5, width: 0, height: 0 };
            updateOverlay();
            crop.classList.remove('active');
        });

        const flipBtn = $('#flip-orientation-button');
        flipBtn.textContent = settings.get('cropOrientation') === 'vertical' ? '▯' : '▭';
        flipBtn.addEventListener('click', () => {
            const newOr = settings.get('cropOrientation') === 'vertical' ? 'horizontal' : 'vertical';
            settings.set('cropOrientation', newOr);
            flipBtn.textContent = newOr === 'vertical' ? '▯' : '▭';
            state.relative = { x: 0.5, y: 0.5, width: 0, height: 0 };
            updateOverlay();
        });

        const centerBtn = $('#center-crop-button');
        centerBtn.addEventListener('click', () => {
            state.relative.x = 0.5;
            state.relative.y = 0.5;
            updateOverlay();
        });

        $('#no-crop-button').addEventListener('click', () => {
            cropBtn.classList.remove('active');
            $('.crop-overlay').style.display = 'none';
            crop.classList.remove('active');
        });

        createOverlay();
    };

    const toggleCrop = (forceClose = false) => {
        if (forceClose) { crop.classList.remove('active'); return; }
        const compress = $('#compress');
        if (compress?.classList.contains('active')) {
            compress.classList.remove('active');
            $('#compress-button').classList.remove('active');
        }
        crop.classList.toggle('active');
        const overlay = $('.crop-overlay');
        if (!cropBtn.classList.contains('active')) {
            cropBtn.classList.add('active');
            overlay.style.display = 'block';
            updateOverlay();
        }
        if (crop.classList.contains('active')) {
            setTimeout(() => {
                const handleClick = (e) => {
                    if (!crop.contains(e.target) && !cropBtn.contains(e.target)) {
                        crop.classList.remove('active');
                        document.removeEventListener('click', handleClick);
                    }
                };
                document.addEventListener('click', handleClick);
            }, 0);
        }
    };

    const reset = () => {
        cropBtn.classList.remove('active');
        const overlay = $('.crop-overlay');
        if (overlay) overlay.style.display = 'none';
        crop.classList.remove('active');
        state.relative = { x: 0.5, y: 0.5, width: 0, height: 0 };
        if (video.videoWidth && video.videoHeight) {
            const ratio = $('#ratio-select')?.value || settings.get('cropAspectRatio') || '16:9';
            window.cropSettings = calcCrop(ratio, false);
        }
    };

    const init = () => {
        setupUI();
        
        cropBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!cropBtn.classList.contains('active')) {
                state.relative = { x: 0.5, y: 0.5, width: 0, height: 0 };
            }
            toggleCrop();
        });

        document.addEventListener('keypress', (e) => {
            if (!video.src) return;

            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            if (e.code === 'KeyC' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                if (!cropBtn.classList.contains('active')) {
                    state.relative = { x: 0.5, y: 0.5, width: 0, height: 0 };
                }
                toggleCrop();
            }
        });

        video.addEventListener('loadedmetadata', reset);
        video.addEventListener('videoFileLoaded', reset);
        new ResizeObserver(() => {
            if (cropBtn.classList.contains('active')) updateOverlay();
        }).observe(videoWrapper);
        window.addEventListener('unload', () => {
            document.removeEventListener('keypress', handleKeyboard);
        });
    };

    return {
        init,
        toggleCrop,
        getCurrentCrop: () => cropBtn.classList.contains('active') ? window.cropSettings : null,
        reset
    };
};