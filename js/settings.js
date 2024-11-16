const VideoPlayerSettings = (() => {
    const STORAGE_KEY = 'videoPlayerSettings';
    const DEFAULT_SETTINGS = {
        theme: 'dark',
        loop: true,
        volume: 1.0,
        version: '1.0'
    };

    let currentSettings = {};

    const loadSettings = () => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            currentSettings = stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
        } catch (e) {
            console.warn('Failed to load settings:', e);
            currentSettings = DEFAULT_SETTINGS;
        }
        return currentSettings;
    };

    const saveSettings = () => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
        } catch (e) {
            console.warn('Failed to save settings:', e);
        }
    };

    const setSetting = (key, value) => {
        console.log(`${key} ${value}`);
        currentSettings[key] = value;
        saveSettings();
    };

    const getSetting = (key) => currentSettings[key];

    const applySettings = () => {
        // Apply theme
        document.documentElement.setAttribute('data-theme', currentSettings.theme);
        const themeBtn = document.querySelector('#themeBtn');
        if (themeBtn) themeBtn.textContent = currentSettings.theme === 'light' ? '🌙' : '☀️';

        // Apply loop
        const video = document.querySelector('#video');
        const loopBtn = document.querySelector('#loopBtn');
        if (video) video.loop = currentSettings.loop;
        if (loopBtn) loopBtn.classList.toggle('active', currentSettings.loop);

        // Apply volume
        if (video) video.volume = currentSettings.volume;
    };

    // Initialize settings on load
    loadSettings();

    // Public API
    return {
        load: loadSettings,
        save: saveSettings,
        set: setSetting,
        get: getSetting,
        apply: applySettings
    };
})();