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

    // Update container warning with clear message and styling
    const showContainerWarning = (compatibleContainers, currentExt) => {
        let warningEl = $('.codec-container-warning');
        if (!warningEl) {
            warningEl = document.createElement('div');
            warningEl.className = 'codec-container-warning';
            $('.compress-content').appendChild(warningEl);
        }

        if (compatibleContainers.length === 0) {
            warningEl.textContent = 'No compatible formats found for selected codecs';
            warningEl.style.backgroundColor = 'var(--secondary-accent)';
            return compatibleContainers;
        }

        // Sort containers to put current extension first if compatible
        const sortedContainers = compatibleContainers.sort((a, b) => {
            if (currentExt) {
                if (a === currentExt) return -1;
                if (b === currentExt) return 1;
            }
            // Secondary sort by common preference
            const preference = ['mp4', 'webm', 'mkv', 'mov', 'avi'];
            return preference.indexOf(a) - preference.indexOf(b);
        });

        if (!currentExt) {
            warningEl.textContent = `Compatible formats: ${sortedContainers.join(', ')}`;
            warningEl.style.backgroundColor = '';
        } else if (!compatibleContainers.includes(currentExt)) {
            warningEl.textContent = `Current format (${currentExt}) is not compatible with selected codecs. Compatible formats: ${sortedContainers.join(', ')}`;
            warningEl.style.backgroundColor = 'var(--secondary-accent)';
        } else {
            warningEl.textContent = `Compatible formats: ${sortedContainers.join(', ')}`;
            warningEl.style.backgroundColor = '';
        }

        return sortedContainers;
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
            const video_codec = $('#video-codec-select').value;
            const audio_codec = $('#audio-codec-select').value;
            const quality = $('#quality-slider').value;

            changes.compression = {
                video_codec,
                audio_codec,
                quality: parseInt(quality),
                container: currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1).toLowerCase()
            };
        }

        return changes;
    };

    const getCompatibleContainers = (changes) => {
        if (!changes.compression) {
            const currentContainer = currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1).toLowerCase();
            return [currentContainer];
        }

        const { video_codec, audio_codec } = changes.compression;
        const videoSupported = CODEC_CONTAINER_SUPPORT[video_codec] || CODEC_CONTAINER_SUPPORT['auto'];
        const audioSupported = AUDIO_CONTAINER_SUPPORT[audio_codec] || AUDIO_CONTAINER_SUPPORT['auto'];

        const compatible = videoSupported.filter(container => 
            audioSupported.includes(container)
        );
        return compatible;
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
        const source = getSourceInfo();
        const outputContainer = outputPath.substring(outputPath.lastIndexOf('.') + 1).toLowerCase();

        const saveOperation = {
            source,
            changes,
            output: {
                path: outputPath,
                container: outputContainer
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
            const currentContainer = currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1).toLowerCase();
            const compatibleContainers = getCompatibleContainers(changes);

            if (compatibleContainers.length === 0) {
                await message('No compatible containers available for the selected codecs', 
                    { title: 'Video Editor', kind: 'error' });
                return;
            }

            // Sort containers to prioritize current container if compatible
            const sortedContainers = compatibleContainers.sort((a, b) => {
                if (a === currentContainer) return -1;
                if (b === currentContainer) return 1;
                return 0;
            });

            // Construct default output filename with preferred container
            const nameWithoutExt = currentFile.name.substring(0, currentFile.name.lastIndexOf('.'));
            const defaultContainer = sortedContainers[0];
            const defaultPath = `${nameWithoutExt}.${defaultContainer}`;

            const outputPath = await save({
                defaultPath,
                filters: [{
                    name: changes.compression ? 'Compatible Formats' : 'Video',
                    extensions: compatibleContainers
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

            return true;
        } catch (error) {
            if (error.message && error.message.includes('container format')) {
                await message(error.message, { 
                    title: 'Invalid Container Format', 
                    kind: 'error' 
                });
            } else {
                await message('Save failed\nLook at the developer console for more information.', 
                    { title: 'Video Editor', kind: 'error' });
            }
            return false;
        }
    };

    const updateContainerCompatibility = () => {
        const changes = gatherChanges();
        if (changes.compression) {
            if (!currentFile) {
                // If no file is loaded yet, just show generally compatible containers
                const { video_codec, audio_codec } = changes.compression;
                const videoSupported = CODEC_CONTAINER_SUPPORT[video_codec] || CODEC_CONTAINER_SUPPORT['auto'];
                const audioSupported = AUDIO_CONTAINER_SUPPORT[audio_codec] || AUDIO_CONTAINER_SUPPORT['auto'];
                const compatibleContainers = videoSupported.filter(container => 
                    audioSupported.includes(container)
                );
                showContainerWarning(compatibleContainers, null);
            } else {
                const currentExt = currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1).toLowerCase();
                const compatibleContainers = getCompatibleContainers(changes);
                showContainerWarning(compatibleContainers, currentExt);
            }
        }
    };

    const init = () => {
        video.addEventListener('videoFileLoaded', (event) => {
            currentFile = event.detail.file;
            // Check container compatibility whenever a new video is loaded
            updateContainerCompatibility();
        });

        saveBtn.addEventListener('click', saveVideo);
        compressSaveBtn.addEventListener('click', saveVideo);
        compressSaveBtn.textContent = 'Save';

        // Add keyboard shortcut for saving (Ctrl/Cmd + S)
        document.addEventListener('keydown', async (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                await saveVideo(e);
            }
        });

        const videoCodecSelect = $('#video-codec-select');
        const audioCodecSelect = $('#audio-codec-select');
        if (videoCodecSelect && audioCodecSelect) {
            videoCodecSelect.addEventListener('change', updateContainerCompatibility);
            audioCodecSelect.addEventListener('change', updateContainerCompatibility);
        }

        // Also check compatibility if compress panel is already active when file is loaded
        const compress = $('#compress');
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (compress.classList.contains('active') && currentFile) {
                        updateContainerCompatibility();
                    }
                }
            });
        });

        observer.observe(compress, {
            attributes: true
        });
    };

    return {
        init,
        saveVideo
    };
};