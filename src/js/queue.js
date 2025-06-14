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

        const terminateBtn = item.querySelector('.queue-terminate');
        const statusText = item.querySelector('.queue-item-status');

        terminateBtn.addEventListener('click', async () => {
            terminateBtn.disabled = true;
            statusText.textContent = 'Cancelling…';
            item.classList.add('terminating');

            const revert = setTimeout(() => {
                item.classList.remove('terminating');
                terminateBtn.disabled = false;
                statusText.textContent = 'Cancel failed';
            }, 5000);

            try {
                await invoke('terminate_process', { queueId: id });
                clearTimeout(revert);
                completeQueueItem(id, false);
                window.showNotification('Process cancelled', 'info');
            } catch (e) {
                clearTimeout(revert);
                console.warn(e);
                item.classList.remove('terminating');
                terminateBtn.disabled = false;
                statusText.textContent = 'Error cancelling';
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

        if (item.classList.contains('terminating')) return;
        
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
        
        item.classList.remove('terminating');
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

    const restoreQueue = async () => {
        try {
            const existingItems = await invoke('get_queue_state');
            
            existingItems.forEach(item => {
                const queueItem = createQueueItem(item.queue_id, item.file_name);
                queueContent.appendChild(queueItem);
                queueItems.set(item.queue_id, queueItem);
                
                updateQueueItem({
                    queue_id: item.queue_id,
                    progress: item.progress,
                    status: item.status,
                    speed: item.speed,
                    eta: item.eta
                });
            });
            
            if (existingItems.length > 0) {
                queueContainer.classList.add('visible');
            }
        } catch (error) {
            console.error('Failed to restore queue state:', error);
        }
    };
    
    const init = async () => {
        await listen('queue-progress', (event) => {
            updateQueueItem(event.payload);
        });

        await restoreQueue();
    };
    
    return {
        init,
        addToQueue,
        completeQueueItem
    };
};