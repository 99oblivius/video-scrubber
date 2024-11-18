import { setupControls } from './controls.js';
import { setupProgressBar } from './progress.js';
import { setupDropZone } from './dropzone.js';
import { setupMetadata } from './metadata.js';
import { setupSettings } from './settings.js';
import { setupHelpTip } from './help.js';

const player = (() => {
    const $ = document.querySelector.bind(document);
    const v = $('#video');
    const dc = $('#dropContainer');
    
    let frameTime = 1/30;

    const init = () => {
        const settings = setupSettings();
        const controls = setupControls(v, frameTime, settings);
        const progress = setupProgressBar(v);
        const metadata = setupMetadata(v);
        const dropzone = setupDropZone(v, dc, metadata);
        const help = setupHelpTip(settings);

        // Initialize all modules
        settings.init();
        settings.apply();
        controls.init();
        progress.init();
        dropzone.init();
        metadata.init();
        help.init();

        requestAnimationFrame(progress.updateTimeDisplay);
    };

    return { init };
})();

document.addEventListener('DOMContentLoaded', player.init);