const {
    updater,
    core: { invoke },
    event: { listen },
    process: tauriProcess,
} = window.__TAURI__;

const relaunch = tauriProcess?.relaunch ?? (() => window.location.reload());

class UpdateManager {
    constructor() {
        this.appUpdate = null;
        this.listeners = [];
        this.updateContainer = null;
        this.binaryProgress = {};
    }

    async init() {
        try {
            this.appUpdate = await updater.check();
            
            if (this.appUpdate?.available) {
                return await this._handleAppUpdate();
            }
        } catch (e) {
            console.error("App update check failed", e);
        }

        const unlisten = await listen("binary-update-progress", (e) =>
            this._onBinaryProgress(e.payload)
        );
        this.listeners.push(unlisten);
        
        return false;
    }

    async _handleAppUpdate() {
        console.log("App update available:", this.appUpdate);
        
        const splashProgressContainer = document.getElementById("splash-progress");
        if (splashProgressContainer) {
            const updateItem = document.createElement("div");
            updateItem.className = "binary-progress-item downloading";
            updateItem.innerHTML = `
                <div class="binary-info">
                    <span class="binary-name">App Update</span>
                    <span class="binary-status">v${this.appUpdate.version} available</span>
                </div>
                <div class="binary-progress-bar">
                    <div class="binary-progress-fill"></div>
                </div>
                <div class="binary-download-speed"></div>
            `;
            splashProgressContainer.appendChild(updateItem);
            
            try {
                let downloaded = 0;
                let contentLength = 0;
                const progressFill = updateItem.querySelector(".binary-progress-fill");
                const statusEl = updateItem.querySelector(".binary-status");
                const speedEl = updateItem.querySelector(".binary-download-speed");
                
                await new Promise(r => setTimeout(r, 3500));
                await this.appUpdate.downloadAndInstall((event) => {
                    switch (event.event) {
                        case 'Started':
                            contentLength = event.data.contentLength;
                            statusEl.textContent = `Downloading update...`;
                            console.log(`Started downloading ${contentLength} bytes`);
                            break;
                        case 'Progress':
                            downloaded += event.data.chunkLength;
                            const progress = Math.round((downloaded / contentLength) * 100);
                            progressFill.style.width = `${progress}%`;
                            statusEl.textContent = `Downloading: ${progress}%`;
                            
                            const speed = event.data.chunkLength / (event.data.elapsed || 0.1);
                            speedEl.textContent = `Speed: ${(speed / 1024).toFixed(1)} KB/s`;
                            break;
                        case 'Finished':
                            progressFill.style.width = "100%";
                            statusEl.textContent = "Update complete, restarting...";
                            updateItem.classList.remove("downloading");
                            updateItem.classList.add("complete");
                            console.log('Download finished');
                            break;
                    }
                });
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                await relaunch();
                
            } catch (e) {
                console.error("Update failed:", e);
                updateItem.classList.remove("downloading");
                updateItem.classList.add("error");
                const statusEl = updateItem.querySelector(".binary-status");
                statusEl.textContent = `Update failed: ${e.message || e}`;
            }
        } else {
            try {
                await this.appUpdate.downloadAndInstall();
                await relaunch();
                return true;
            } catch (e) {
                console.error("Update failed:", e);
            }
        }
        
        return false;
    }

    _onBinaryProgress({ binary_name, progress, status, message }) {
        this.binaryProgress[binary_name] = {
            progress,
            status,
            message,
            timestamp: Date.now()
        };

        const splashProgressContainer = document.getElementById("splash-progress");
        if (!splashProgressContainer) return;

        let item = splashProgressContainer.querySelector(
            `[data-binary="${binary_name}"]`
        );

        if (!item) {
            item = document.createElement("div");
            item.className = "binary-progress-item";
            item.setAttribute("data-binary", binary_name);
            item.innerHTML = `
                <div class="binary-info">
                    <span class="binary-name">${binary_name}</span>
                    <span class="binary-status">${message || status}</span>
                </div>
                <div class="binary-progress-bar">
                    <div class="binary-progress-fill"></div>
                </div>
                ${status === 'downloading' ? `
                <div class="binary-download-speed"></div>
                ` : ''}
            `;
            splashProgressContainer.appendChild(item);
        }

        const fill = item.querySelector(".binary-progress-fill");
        const statusEl = item.querySelector(".binary-status");
        const speedEl = item.querySelector(".binary-download-speed");

        if (fill) {
            fill.style.setProperty('--progress', `${progress}%`);
        }
        if (statusEl) {
            statusEl.textContent = message || status;
        }

        if (speedEl && status === 'downloading') {
            const prev = this.binaryProgress[binary_name];
            speedEl.textContent = "";
        }

        item.classList.remove("complete", "error", "downloading");
        if (status === "complete") {
            item.classList.add("complete");
        } else if (status === "error") {
            item.classList.add("error");
        } else if (status === "downloading") {
            item.classList.add("downloading");
        }
    }

    async checkAndUpdateBinaries() {
        const splashProgressContainer = document.getElementById("splash-progress");
        if (splashProgressContainer) {
            splashProgressContainer.style.display = "flex";
            splashProgressContainer.innerHTML = ''; 
        }

        let binaryInfos;
        try {
            binaryInfos = await invoke("check_all_binaries");
        } catch (e) {
            console.error("check_all_binaries failed", e);
            window.showNotification("Failed to check dependencies", "error");
            return false;
        }

        const toUpdate = binaryInfos.filter((b) => b.needs_update);

        if (toUpdate.length === 0) {
            if (splashProgressContainer) {
                splashProgressContainer.style.display = "none";
            }
            return true;
        }

        toUpdate.forEach((b) => {
            this._onBinaryProgress({
                binary_name: b.name,
                progress: 0,
                status: "pending",
                message: b.is_installed ? "Update available" : "Not installed",
            });
        });
        
        for (const binary of toUpdate) {
            try {
                await invoke("update_binary", { binaryName: binary.name });
            } catch (err) {
                console.error(`update_binary for ${binary.name} failed`, err);
                this._onBinaryProgress({
                    binary_name: binary.name,
                    progress: 100,
                    status: "error",
                    message: `Update failed: ${err.message || err}`,
                });
                return false;
            }
        }

        return true;
    }

    destroy() {
        this.listeners.forEach((unlisten) => unlisten());
    }
}

export function setupUpdater() {
    const init = async () => {
        await listen('updater-log', (event) => {
            console.warn(event.payload);
        });
    };
    return new UpdateManager();
}