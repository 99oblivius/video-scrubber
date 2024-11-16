const STORAGE_KEY = 'videoPlayerSettings';
const DEFAULT_SETTINGS = {
    theme: 'dark',
    loop: true,
    volume: 1.0,
    hasSeenHelpTip: false,
    version: '1.0'
};

export const setupSettings = () => {
    const $ = document.querySelector.bind(document);
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
        currentSettings[key] = value;
        saveSettings();
    };

    const getSetting = (key) => currentSettings[key];

    const applySettings = () => {
        // Apply theme
        document.documentElement.setAttribute('data-theme', currentSettings.theme);
        const themeBtn = $('#themeBtn');
        if (themeBtn) themeBtn.textContent = currentSettings.theme === 'light' ? '🌙' : '☀️';

        // Apply loop
        const video = $('#video');
        const loopBtn = $('#loopBtn');
        if (video) video.loop = currentSettings.loop;
        if (loopBtn) loopBtn.classList.toggle('active', currentSettings.loop);

        // Apply volume
        if (video) video.volume = currentSettings.volume;
    };

    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        const themeBtn = $('#themeBtn');
        themeBtn.textContent = newTheme === 'light' ? '🌙' : '☀️';
        setSetting('theme', newTheme);
    };

    const init = () => {
        loadSettings();
        const themeBtn = $('#themeBtn');
        themeBtn.onclick = toggleTheme;
    };

    return {
        init,
        set: setSetting,
        get: getSetting,
        apply: applySettings,
        toggleTheme
    };
};