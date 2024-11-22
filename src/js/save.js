const { message, save } = window.__TAURI__.dialog;
const { invoke } = window.__TAURI__.core;

export const setupSave = (video) => {
    const $ = document.querySelector.bind(document);
    const saveBtn = $('#save-button');
    const compressBtn = $('#compress-button');
    const compressSaveBtn = $('.compress-save-button');
    let currentFile = null;

    const CODEC_CONTAINER_SUPPORT = {
        'h264': ['mp4', 'mkv', 'mov', 'avi'],
        'h265': ['mp4', 'mkv', 'mov'],
        'av1': ['mp4', 'mkv', 'webm'],
        'vp8': ['webm', 'mkv'],
        'vp9': ['webm', 'mkv', 'mp4'],
        'auto': ['mp4', 'webm', 'mkv', 'mov', 'avi']
    };

    const AUDIO_CONTAINER_SUPPORT = {
        'aac': ['mp4', 'mkv', 'mov', 'avi'],
        'mp3': ['mp4', 'mkv', 'mov', 'avi'],
        'opus': ['webm', 'mkv'],
        'vorbis': ['webm', 'mkv'],
        'ac3': ['mp4', 'mkv', 'mov'],
        'flac': ['mkv'],
        'auto': ['mp4', 'webm', 'mkv', 'mov', 'avi']
    };

    const getSourceInfo = () => {
        if (!currentFile) return null;
        
        return {
            path: currentFile.path,
            name: currentFile.name,
            size: currentFile.size,
            container: currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1).toLowerCase(),
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight
        };
    };

    const getTrimChanges = () => {
        const trimStart = window.trimStart;
        const trimEnd = window.trimEnd;
        
        if (trimStart !== undefined && trimEnd !== undefined) {
            return {
                startTime: trimStart,
                endTime: trimEnd
            };
        }
        return null;
    };

    const getCropChanges = () => {
        const cropSettings = window.cropSettings;
        
        if (cropSettings) {
            return {
                width: cropSettings.width,
                height: cropSettings.height,
                x: cropSettings.x,
                y: cropSettings.y
            };
        }
        return null;
    };

    const gatherChanges = () => {
        const changes = {
            trim: getTrimChanges(),
            crop: getCropChanges(),
        };

        const compress = $('#compress');
        if (compress?.classList.contains('active')) {
            const videoCodec = $('#video-codec-select').value;
            const audioCodec = $('#audio-codec-select').value;
            const quality = $('#quality-slider').value;

            changes.compression = {
                videoCodec,
                audioCodec,
                quality: parseInt(quality)
            };
        }

        return changes;
    };

    const getCompatibleContainers = (changes) => {
        if (!changes.compression) {
            const currentContainer = currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1).toLowerCase();
            return [currentContainer];
        }

        const { videoCodec, audioCodec } = changes.compression;
        const videoSupported = CODEC_CONTAINER_SUPPORT[videoCodec] || [];
        const audioSupported = AUDIO_CONTAINER_SUPPORT[audioCodec] || [];
        
        return videoSupported.filter(container => 
            audioSupported.includes(container)
        );
    };

    const validateContainer = (container, compatibleContainers) => {
        if (!compatibleContainers.includes(container)) {
            const containerList = compatibleContainers.join(', ');
            throw new Error(
                `The selected container format "${container}" is not compatible with the chosen codecs.\n` +
                `Compatible formats are: ${containerList}`
            );
        }
    };

    const prepareSaveOperation = async (outputPath, changes) => {
        const sourceInfo = getSourceInfo();
        const outputContainer = outputPath.substring(outputPath.lastIndexOf('.') + 1).toLowerCase();

        const saveOperation = {
            source: {
                ...sourceInfo,
                currentTime: video.currentTime
            },
            output: {
                path: outputPath,
                container: outputContainer
            },
            changes: {
                ...changes,
                timestamp: new Date().toISOString()
            }
        };

        if (changes.compression) {
            saveOperation.compression = {
                ...changes.compression,
                container: outputContainer
            };
        }

        return saveOperation;
    };

    const saveVideo = async (e) => {
        e?.preventDefault();
        e?.stopPropagation();
        
        if (!currentFile) {
            await message('No video loaded', { title: 'Video Editor', kind: 'error' });
            return;
        }

        try {
            const changes = gatherChanges();

            const compatibleContainers = getCompatibleContainers(changes);
            if (compatibleContainers.length === 0) {
                await message('No compatible containers available for the selected codecs', 
                    { title: 'Video Editor', kind: 'error' });
                return;
            }

            const currentContainer = currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1).toLowerCase();
            let containers = compatibleContainers;
            if (compatibleContainers.includes(currentContainer)) {
                containers = [currentContainer, ...compatibleContainers.filter(c => c !== currentContainer)];
            }

            const outputPath = await save({
                defaultPath: currentFile.name || `video.${containers[0]}`,
                filters: [{
                    name: changes.compression ? 'Compatible Formats' : 'Video',
                    extensions: containers
                }]
            });

            if (!outputPath) return;

            const selectedContainer = outputPath.substring(outputPath.lastIndexOf('.') + 1).toLowerCase();
            
            if (changes.compression) {
                validateContainer(selectedContainer, compatibleContainers);
            }

            const saveOperation = await prepareSaveOperation(outputPath, changes);

            const saveStartMessage = changes.compression ? 'Compressing and saving...' : 'Saving...';
            await message(saveStartMessage, { title: 'Video Editor' });
            
            await invoke('save_video', { operation: saveOperation });

            await message(`Save succeeded: ${outputPath}`, { title: 'Video Editor' });
            
            const compress = $('#compress');
            if (compress?.classList.contains('active')) {
                compress.classList.remove('active');
                compressBtn.classList.remove('active');
            }
        } catch (error) {
            console.error('Save failed:', error);
            
            if (error.message && error.message.includes('container format')) {
                await message(error.message, { 
                    title: 'Invalid Container Format', 
                    kind: 'error' 
                });
            } else {
                await message('Save failed\nLook at the developer console for more information.', 
                    { title: 'Video Editor', kind: 'error' });
            }
        }
    };

    const showContainerWarning = (compatibleContainers) => {
        let warningEl = $('.codec-container-warning');
        if (!warningEl) {
            warningEl = document.createElement('div');
            warningEl.className = 'codec-container-warning';
            $('.compress-content').appendChild(warningEl);
        }
        warningEl.textContent = `Note: Compatible formats are: ${compatibleContainers.join(', ')}`;
    };

    const updateContainerCompatibility = () => {
        const changes = gatherChanges();
        if (changes.compression) {
            const compatibleContainers = getCompatibleContainers(changes);
            showContainerWarning(compatibleContainers);
        }
    };

    const init = () => {
        video.addEventListener('videoFileLoaded', (event) => {
            currentFile = event.detail.file;
        });

        saveBtn.addEventListener('click', saveVideo);
        compressSaveBtn.addEventListener('click', saveVideo);

        compressSaveBtn.textContent = 'Save';

        const videoCodecSelect = $('#video-codec-select');
        const audioCodecSelect = $('#audio-codec-select');
        if (videoCodecSelect && audioCodecSelect) {
            videoCodecSelect.addEventListener('change', updateContainerCompatibility);
            audioCodecSelect.addEventListener('change', updateContainerCompatibility);
        }
    };

    return {
        init,
        saveVideo
    };
};