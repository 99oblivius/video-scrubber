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

const makeSafeFileName = (title, maxLen = 100) => title
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\/?<>\\:*|":]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLen);

const showNotification = (message, type = "info", duration = 3000) => {
    const notification = document.getElementById("global-notification");
    if (!notification) return;

    notification.textContent = message;
    notification.className = "";
    notification.classList.add(`type-${type}`);

    notification.classList.remove("show");
    void notification.offsetWidth;
    notification.classList.add("show");

    if (window.notificationTimeout) {
        clearTimeout(window.notificationTimeout);
    }

    window.notificationTimeout = setTimeout(() => {
        notification.classList.remove("show");
    }, duration);
};

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

const setupFocusTrap = () => {
    const container = document.querySelector(".main-container");
    if (!container) return;

    const focusableSelector =
        'a[href]:not([disabled]), button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Tab") return;

        const focusable = Array.from(
            container.querySelectorAll(focusableSelector)
        ).filter(
            (el) =>
                !!(
                    el.offsetWidth ||
                    el.offsetHeight ||
                    el.getClientRects().length
                )
        );

        const sortedFocusable = focusable.sort((a, b) => {
            const tabA = parseInt(a.getAttribute("tabindex")) || 0;
            const tabB = parseInt(b.getAttribute("tabindex")) || 0;
            if (tabA > 0 && tabB > 0) return tabA - tabB;
            if (tabA > 0) return -1;
            if (tabB > 0) return 1;
            return 0;
        });

        if (sortedFocusable.length === 0) return;

        const firstElement = sortedFocusable[0];
        const lastElement = sortedFocusable[sortedFocusable.length - 1];
        const activeElement = document.activeElement;

        const isFocusOutside = !sortedFocusable.includes(activeElement);

        if (isFocusOutside) {
            firstElement.focus();
            e.preventDefault();
            return;
        }

        if (e.shiftKey) {
            if (activeElement === firstElement) {
                lastElement.focus();
                e.preventDefault();
            }
        } else {
            if (activeElement === lastElement) {
                firstElement.focus();
                e.preventDefault();
            }
        }
    });
};

const player = (() => {
    const $ = document.querySelector.bind(document);
    const v = $('#video');
    const dc = $('#dropContainer');
    
    const init = () => {
        window.showNotification = showNotification;
        window.makeSafeFileName = makeSafeFileName;
        
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

        setupFocusTrap();

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