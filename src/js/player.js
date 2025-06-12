const { invoke } = window.__TAURI__.core;

import { setupCompress } from './compress.js';
import { setupControls } from './controls.js';
import { setupCrop } from './crop.js';
import { setupDropZone } from './dropzone.js';
import { setupHelpTip } from './help.js';
import { setupMetadata } from './metadata.js';
import { setupProgressBar } from './progress.js';
import { setupSave } from './save.js';
import { setupSettings } from './settings.js';
import { setupTrim } from './trim.js';
import { setupUrlLoader } from './url-loader.js';

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
        const dropzone = setupDropZone(v, dc, metadata);
        const controls = setupControls(v, metadata, settings, dropzone);
        const urlLoader = setupUrlLoader(v, dc, metadata, dropzone);
        const help = setupHelpTip(settings);
        const trim = setupTrim(v, metadata);
        const compress = setupCompress(v);
        const crop = setupCrop(v, settings);
        const save = setupSave(v);

        settings.init();
        settings.apply();
        controls.init();
        progress.init();
        dropzone.init();
        urlLoader.init();
        metadata.init();
        help.init();
        trim.init();
        compress.init();
        crop.init();
        save.init();

        requestAnimationFrame(progress.updateTimeDisplay);
    };

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
    printWelcomeMessage();
    player.init();
    setTimeout(async () => { await invoke('show_app_window'); }, 50);
    
    setTimeout(() => {
        const splash = document.getElementById('splash');
        splash.style.opacity = '0';
        
        setTimeout(() => { splash.remove(); }, 350);
    }, 400);
});