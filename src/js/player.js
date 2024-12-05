import { setupControls } from './controls.js';
import { setupProgressBar } from './progress.js';
import { setupDropZone } from './dropzone.js';
import { setupMetadata } from './metadata.js';
import { setupSettings } from './settings.js';
import { setupHelpTip } from './help.js';
import { setupTrim } from './trim.js';

import { setupCompress } from './compress.js';
import { setupSave } from './save.js';

const printWelcomeMessage = () => {
    const styles = {
        title: 'font-family: monospace; font-size: 12px; font-weight: bold; color: #3B82F6;',
        subtitle: 'color: #888; font-style: italic;',
        info: 'color: #666;'
    };

    console.info(`%c
    ╔═══════════════════════════════════════════════════════════════════════════╗
    ║                                                                           ║
    ║   ██╗   ██╗██╗██████╗ ███████╗ ██████╗     ███████╗██████╗ ██╗████████╗   ║
    ║   ██║   ██║██║██╔══██╗██╔════╝██╔═══██╗    ██╔════╝██╔══██╗██║╚══██╔══╝   ║
    ║   ██║   ██║██║██║  ██║█████╗  ██║   ██║    █████╗  ██║  ██║██║   ██║      ║
    ║   ╚██╗ ██╔╝██║██║  ██║██╔══╝  ██║   ██║    ██╔══╝  ██║  ██║██║   ██║      ║
    ║    ╚████╔╝ ██║██████╔╝███████╗╚██████╔╝    ███████╗██████╔╝██║   ██║      ║
    ║     ╚═══╝  ╚═╝╚═════╝ ╚══════╝ ╚═════╝     ╚══════╝╚═════╝ ╚═╝   ╚═╝      ║
    ║                                                                           ║
    ╚═══════════════════════════════════════════════════════════════════════════╝`, styles.title);

    console.info('%cWhen you open a video file, detailed metadata will appear here.', styles.info);
    console.info('%c\nHappy editing! 🎥✨\n', styles.subtitle);
};

const player = (() => {
    const $ = document.querySelector.bind(document);
    const v = $('#video');
    const dc = $('#dropContainer');
    
    const init = () => {
        const settings = setupSettings();
        const metadata = setupMetadata(v);

        const progress = setupProgressBar(v, metadata);
        const controls = setupControls(v, metadata, settings);
        const dropzone = setupDropZone(v, dc, metadata);
        const help = setupHelpTip(settings);
        const trim = setupTrim(v, metadata);
        const compress = setupCompress(v);
        const save = setupSave(v);

        // Initialize all modules
        settings.init();
        settings.apply();
        controls.init();
        progress.init();
        dropzone.init();
        metadata.init();
        help.init();
        trim.init();
        compress.init();
        save.init();

        requestAnimationFrame(progress.updateTimeDisplay);
    };

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
    printWelcomeMessage();
    player.init();
});