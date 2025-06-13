const { listen } = window.__TAURI__.event;
const { invoke } = window.__TAURI__.core;

export const setupQueue = () => {
    const queueItems = new Map();
    
    const createQueueUI = () => {
        const queueContainer = document.createElement('div');
        queueContainer.id = 'queue-container';
        queueContainer.className = 'queue-container';
        
        const queueHeader = document.createElement('div');
        queueHeader.className = 'queue-header';
        queueHeader.innerHTML = '<span>Processing Queue</span>';
        
        const queueContent = document.createElement('div');
        queueContent.className = 'queue-content';
        
        queueContainer.appendChild(queueHeader);
        queueContainer.appendChild(queueContent);
        document.body.appendChild(queueContainer);
        
        return { queueContainer, queueContent };
    };
    
    const { queueContainer, queueContent } = createQueueUI();
    
    const createQueueItem = (id, fileName) => {
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.dataset.queueId = id;
        
        item.innerHTML = `
            <div class="queue-item-header">
                <span class="queue-item-name">${fileName}</span>
                <span class="queue-item-status">Preparing...</span>
            </div>
            <div class="queue-item-progress">
                <button class="queue-terminate" title="Cancel">×</button>
                <div class="queue-progress-bar">
                    <div class="queue-progress-fill"></div>
                </div>
                <span class="queue-progress-text">0%</span>
            </div>
            <div class="queue-item-stats">
                <span class="queue-speed"></span>
                <span class="queue-eta"></span>
            </div>
        `;

        item.querySelector('.queue-terminate').addEventListener('click', async () => {
            const button = item.querySelector('.queue-terminate');
            button.disabled = true;
            console.info("Terminating: " + id.toString());
            try {
                await invoke('terminate_process', { queueId: id });
                completeQueueItem(id, false);
                window.showNotification("Process cancelled", "info");
            } catch (error) {
                console.warn('Process termination:', error);
                button.disabled = false;
            }
        });
        
        return item;
    };
    
    const addToQueue = (id, fileName) => {
        const item = createQueueItem(id, fileName);
        queueContent.appendChild(item);
        queueItems.set(id, item);
        queueContainer.classList.add('visible');
        return id;
    };
    
    const updateQueueItem = (data) => {
        const item = queueItems.get(data.queue_id);
        if (!item) return;
        
        const progressFill = item.querySelector('.queue-progress-fill');
        const progressText = item.querySelector('.queue-progress-text');
        const statusText = item.querySelector('.queue-item-status');
        const speedText = item.querySelector('.queue-speed');
        const etaText = item.querySelector('.queue-eta');
        
        progressFill.style.width = `${data.progress}%`;
        progressText.textContent = `${Math.round(data.progress)}%`;
        
        statusText.textContent = data.status === 'downloading' ? 'Downloading...' : data.status === 'processing' ? 'Processing...' : data.status;
        
        if (data.speed) speedText.textContent = data.speed;
        if (data.eta) etaText.textContent = `ETA: ${data.eta}`;
    };
    
    const completeQueueItem = (id, success = true) => {
        const item = queueItems.get(id);
        if (!item) return;
        
        const statusText = item.querySelector('.queue-item-status');
        statusText.textContent = success ? 'Complete' : 'Failed';
        item.classList.add(success ? 'complete' : 'failed');
        
        setTimeout(() => {
            item.classList.add('fade-out');
            setTimeout(() => {
                item.remove();
                queueItems.delete(id);
                if (queueItems.size === 0) {
                    queueContainer.classList.remove('visible');
                }
            }, 300);
        }, 2000);
    };
    
    const init = async () => {
        await listen('queue-progress', (event) => {
            updateQueueItem(event.payload);
        });
    };
    
    return {
        init,
        addToQueue,
        completeQueueItem
    };
};