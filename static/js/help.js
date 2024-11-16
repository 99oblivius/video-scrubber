export const setupHelpTip = (settings) => {
    const $ = document.querySelector.bind(document);
    const tooltip = $('#tooltip');
    const helpBtn = $('#helpBtn');
    const helpTip = $('#helpTip');

    const toggleHelp = () => {
        tooltip.classList.toggle('active');
        helpBtn.classList.toggle('active');
    };

    const showInitialHelpTip = () => {
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

    const init = () => {
        helpBtn.onclick = toggleHelp;
        
        document.addEventListener('click', e => {
            if (!tooltip.contains(e.target) && !helpBtn.contains(e.target)) {
                tooltip.classList.remove('active');
                helpBtn.classList.remove('active');
            }
        });

        showInitialHelpTip();
    };

    return {
        init,
        toggleHelp
    };
};