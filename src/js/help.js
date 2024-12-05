export const setupHelpTip = (settings) => {
    const $ = document.querySelector.bind(document);
    const tooltip = $('#tooltip');
    const helpBtn = $('#helpBtn');
    const helpTip = $('#helpTip');

    // Keyboard shortcuts configuration
    const KEYBOARD_SHORTCUTS = {
        playback: {
            title: 'Playback',
            shortcuts: [
                { keys: ['Spc'], description: 'Play/Pause' },
                { keys: [',', '.'], description: '±1 Frame' },
                { keys: ['←', '→'], description: '±1 second' },
                { keys: ['0-9'], description: 'Jump to 0-90%' },
                { keys: ['Shft'], description: '± Frames' },
                { keys: ['Ctrl'], description: '± Seconds' },
            ]
        },
        file: {
            title: 'File',
            shortcuts: [
                { keys: ['Ctrl', 'O'], description: 'Open File' },
                { keys: ['Ctrl', 'S'], description: 'Save' },
            ]
        },
        audio: {
            title: 'Audio',
            shortcuts: [
                { keys: ['↑', '↓'], description: 'Vol ±5%' },
                { keys: ['Whl'], description: 'Vol ±5%' },
                { keys: ['M'], description: 'Mute' },
            ]
        },
        view: {
            title: 'View',
            shortcuts: [
                { keys: ['F'], description: 'Fullscreen' },
                { keys: ['T'], description: 'Theme' },
                { keys: ['H'], description: 'Help' },
            ]
        },
        controls: {
            title: 'Controls',
            shortcuts: [
                { keys: ['X'], description: 'Toggle Trim Mode' },
                { keys: ['[', ']'], description: 'Start/End Trim' },
                { keys: ['L'], description: 'Loop' },
            ]
        }
    };

    const createTooltipContent = () => {
        const content = document.createElement('div');
        content.className = 'tooltip-content';

        const grid = document.createElement('div');
        grid.className = 'shortcut-categories';

        Object.entries(KEYBOARD_SHORTCUTS).forEach(([category, data]) => {
            const categorySection = document.createElement('div');
            categorySection.className = 'shortcut-category';

            const title = document.createElement('h4');
            title.className = 'category-title';
            title.textContent = data.title;
            categorySection.appendChild(title);

            const shortcuts = document.createElement('div');
            shortcuts.className = 'keybind-grid';

            data.shortcuts.forEach(shortcut => {
                const keyElement = document.createElement('div');
                keyElement.className = 'key';
                keyElement.innerHTML = shortcut.keys.map(key => `<span>${key}</span>`).join('');

                const descElement = document.createElement('div');
                descElement.className = 'description';
                descElement.textContent = shortcut.description;

                shortcuts.appendChild(keyElement);
                shortcuts.appendChild(descElement);
            });

            categorySection.appendChild(shortcuts);
            grid.appendChild(categorySection);
        });

        content.appendChild(grid);
        return content;
    };

    const init = () => {
        tooltip.appendChild(createTooltipContent());

        helpBtn.onclick = () => {
            tooltip.classList.toggle('active');
            helpBtn.classList.toggle('active');
        };
        
        document.addEventListener('click', e => {
            if (!tooltip.contains(e.target) && !helpBtn.contains(e.target)) {
                tooltip.classList.remove('active');
                helpBtn.classList.remove('active');
            }
        });

        // Show initial help tip if user hasn't seen it
        if (!settings.get('hasSeenHelpTip')) {
            helpTip.classList.add('show');
    
            const hideOnH = (e) => {
                if (e.code === 'KeyH') {
                    helpTip.classList.remove('show');
                    settings.set('hasSeenHelpTip', true);
                    document.removeEventListener('keydown', hideOnH);
                }
            };
            document.addEventListener('keydown', hideOnH);
        }
    };

    return {
        init,
        toggleHelp: () => tooltip.classList.toggle('active')
    };
};