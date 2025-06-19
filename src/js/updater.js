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
            if (this.appUpdate?.shouldUpdate) {
                this._showAppUpdateUI();
            }
        } catch (e) {
            console.error("App update check failed", e);
        }

        const unlisten = await listen("binary-update-progress", (e) =>
            this._onBinaryProgress(e.payload)
        );
        this.listeners.push(unlisten);
    }

    _showAppUpdateUI() {
        
        console.log("App update available:", this.appUpdate);
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
                    <div class="binary-progress-fill" style="width: ${progress}%"></div>
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

        fill.style.width = `${progress}%`;
        statusEl.textContent = message || status;

        
        if (speedEl && status === 'downloading') {
            const prevProgress = this.binaryProgress[binary_name]?.progress || 0;
            const prevTime = this.binaryProgress[binary_name]?.timestamp || Date.now();
            const timeDiff = (Date.now() - prevTime) / 1000;
            
            if (timeDiff > 0.5 && progress > prevProgress) {
                const progressDiff = progress - prevProgress;
                const speed = progressDiff / timeDiff;
                speedEl.textContent = `Speed: ${speed.toFixed(1)}%/s`;
            }
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
    return new UpdateManager();
}