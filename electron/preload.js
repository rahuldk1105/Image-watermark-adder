/**
 * Electron Preload Script
 * Exposes safe APIs to renderer process via contextBridge
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Open file dialog to select images
     * @returns {Promise<string[]>} Array of selected file paths
     */
    selectImages: () => ipcRenderer.invoke('select-images'),

    /**
     * Open file dialog to select watermark image
     * @returns {Promise<string|null>} Selected file path or null
     */
    selectWatermark: () => ipcRenderer.invoke('select-watermark'),

    /**
     * Open directory dialog to select output folder
     * @returns {Promise<string|null>} Selected directory path or null
     */
    selectOutputDirectory: () => ipcRenderer.invoke('select-output-directory'),

    /**
     * Get the API port for backend communication
     * @returns {Promise<number>} API port number
     */
    getApiPort: () => ipcRenderer.invoke('get-api-port'),

    /**
     * Read an image file and return as base64 (via main process)
     * @param {string} filePath - Path to the image file
     * @returns {Promise<{path: string, data: string, name: string}>}
     */
    readImageAsBase64: (filePath) => ipcRenderer.invoke('read-image-base64', filePath),

    /**
     * Get default output directory (Desktop/WatermarkedImages)
     * @returns {Promise<string>}
     */
    getDefaultOutputDir: () => ipcRenderer.invoke('get-default-output-dir'),

    /**
     * Check if running in Electron
     */
    isElectron: true
});
