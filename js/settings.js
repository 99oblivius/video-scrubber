const Settings = (() => {
    const STORAGE_KEY = 'videoPlayerSettings';
    const DEFAULT_SETTINGS = {
        theme: 'dark',
        loop: true,
        volume: 1.0,
        version: '1.0'
    };

    let currentSettings = {};

    const load = () => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            currentSettings = stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
        } catch (e) {
            console.warn('Failed to load settings:', e);
            currentSettings = DEFAULT_SETTINGS;
        }
        return currentSettings;
    };

    const save = () => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
        } catch (e) {
            console.warn('Failed to save settings:', e);
        }
    };

    const set = (key, value) => {
        currentSettings[key] = value;
        save();
    };

    const get = (key) => currentSettings[key];

    const apply = () => {
        // Apply theme
        document.documentElement.setAttribute('data-theme', currentSettings.theme);
        $('#themeBtn').textContent = currentSettings.theme === 'light' ? '🌙' : '☀️';

        // Apply loop
        $('#video').loop = currentSettings.loop;
        $('#loopBtn').classList.toggle('active', currentSettings.loop);

        // Apply volume
        $('#video').volume = currentSettings.volume;
    };

    return { load, save, set, get, apply };
})();