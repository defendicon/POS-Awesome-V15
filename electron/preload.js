const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
	getServerUrl: () => ipcRenderer.invoke("get-server-url"),
	normalizeServerUrl: (value) => ipcRenderer.invoke("normalize-server-url", value),
	setServerUrl: (value) => ipcRenderer.invoke("set-server-url", value),
	retryLoad: () => ipcRenderer.invoke("retry-load"),
	openSettings: () => ipcRenderer.invoke("open-settings"),
	probeServer: () => ipcRenderer.invoke("probe-server"),
	resetServer: () => ipcRenderer.invoke("reset-server"),
});
