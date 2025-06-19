// js/updater.js

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
        // This part for app updates can be styled and implemented as you see fit.
        // For now, we focus on the binary updates on the splash screen.
        console.log("App update available:", this.appUpdate);
    }

    _onBinaryProgress({ binary_name, progress, status, message }) {
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
                    <span class="binary-status"></span>
                </div>
                <div class="binary-progress-bar">
                    <div class="binary-progress-fill"></div>
                </div>
            `;
            splashProgressContainer.appendChild(item);
        }

        const fill = item.querySelector(".binary-progress-fill");
        const statusEl = item.querySelector(".binary-status");

        fill.style.width = `${progress}%`;
        statusEl.textContent = message || status;

        item.classList.remove("complete", "error");
        if (status === "complete") {
            item.classList.add("complete");
        } else if (status === "error") {
            item.classList.add("error");
        }
    }

    async checkAndUpdateBinaries() {
        const splashProgressContainer = document.getElementById("splash-progress");
        if (splashProgressContainer) {
            splashProgressContainer.style.display = "flex";
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

        // Immediately show UI for binaries that need updating
        toUpdate.forEach((b) => {
            this._onBinaryProgress({
                binary_name: b.name,
                progress: 0,
                status: "pending",
                message: b.is_installed ? "Outdated" : "Not found, installing...",
            });
        });

        const updatePromises = toUpdate.map((b) =>
            invoke("update_binary", { binaryName: b.name }).catch((err) => {
                console.error(`update_binary for ${b.name} failed`, err);
                this._onBinaryProgress({
                    binary_name: b.name,
                    progress: 100,
                    status: "error",
                    message: `Update failed: ${err}`,
                });
                // Re-throw to make Promise.all fail
                throw new Error(`Update failed for ${b.name}`);
            })
        );

        try {
            await Promise.all(updatePromises);
            // All updates succeeded
            return true;
        } catch (e) {
            // At least one update failed
            console.error(e.message);
            return false;
        }
    }

    destroy() {
        this.listeners.forEach((unlisten) => unlisten());
    }
}

export function setupUpdater() {
    return new UpdateManager();
}