const { invokem } = window.__TAURI__.core;
const { getVersion } = window.__TAURI__.app;

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
import { setupUpdater } from './updater.js';
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

const printWelcomeMessage = async () => {
    const styles = {
        title: "font-family: monospace; font-size: 12px; font-weight: bold; color: #3B82F6;",
        subtitle: "color: #888; font-style: italic;",
        info: "color: #666;",
        version: "color: #888; font-size: 10px;"
    };
    const version = await getVersion();
    
    const versionText = `v${version}`;
    const lineWidth = 54;
    const padding = lineWidth - versionText.length - 1;
    const paddedVersion = " ".repeat(padding) + versionText + " ";

    console.info(
        `%c
    ╔══════════════════════════════════════════════════════╗
    ║                                                      ║
    ║   ██╗     ██╗██╗   ██╗██╗██████╗ ███████╗ ██████╗    ║
    ║   ██║     ██║██║   ██║██║██╔══██╗██╔════╝██╔═══██╗   ║
    ║   ██║     ██║██║   ██║██║██║  ██║█████╗  ██║   ██║   ║
    ║   ██║     ██║╚██╗ ██╔╝██║██║  ██║██╔══╝  ██║   ██║   ║
    ║   ███████╗██║ ╚████╔╝ ██║██████╔╝███████╗╚██████╔╝   ║
    ║   ╚══════╝╚═╝  ╚═══╝  ╚═╝╚═════╝ ╚══════╝ ╚═════╝    ║
    ║${paddedVersion}║
    ╚══════════════════════════════════════════════════════╝`,
        styles.title
    );

    console.info(
        "%cWhen you open a video file, detailed metadata will appear here.",
        styles.info
    );
    console.info("%c\nHappy editing! 🎥✨\n", styles.subtitle);
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

document.addEventListener('DOMContentLoaded', async () => {
    const version = await getVersion();
    const versionElement = document.getElementById('app-version').textContent = `v${version}`;
    printWelcomeMessage();

    function blockRefresh(e) {
        if (e.key === 'F5' || (e.key === 'r' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
    window.addEventListener('keydown', blockRefresh, true);

    const updater = setupUpdater();
    const splash = document.getElementById('splash');
    const splashProgress = document.createElement('div');
    splashProgress.id = 'splash-progress';
    splashProgress.className = 'splash-progress';
    splash.querySelector('img').insertAdjacentElement('afterend', splashProgress);

    const [_, binariesOk] = await Promise.all([
        updater.init(),
        updater.checkAndUpdateBinaries()
    ]);

    if (!binariesOk) {
        const err = document.createElement('div');
        err.className = 'splash-error';
        err.textContent =
            'Failed to initialize required components. Please restart the app.';
        splash.appendChild(err);
        splash.querySelector('.logo-container').style.animation = 'none';
        return;
    }

    player.init();

    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 350);
    window.removeEventListener('keydown', blockRefresh, true);
});