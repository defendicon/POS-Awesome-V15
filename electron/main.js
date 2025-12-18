const path = require("path");
const { app, BrowserWindow, ipcMain, net, shell } = require("electron");
const Store = require("electron-store");

const DEFAULT_PATH = "/app/posapp";
const store = new Store({
	name: "posawesome-desktop",
	defaults: {
		serverUrl: "",
	},
});

let mainWindow;

function ensureUrl(rawUrl) {
	if (!rawUrl || typeof rawUrl !== "string") {
		return "";
	}

	const trimmed = rawUrl.trim();
	if (!trimmed) {
		return "";
	}

	const tryParse = (value) => {
		try {
			const parsed = new URL(value);
			return parsed;
		} catch (error) {
			return null;
		}
	};

	let parsed = tryParse(trimmed);
	if (!parsed) {
		parsed = tryParse(`https://${trimmed}`);
	}

	if (!parsed) {
		return "";
	}

	parsed.hash = "";
	if (!parsed.protocol || parsed.protocol === ":") {
		parsed.protocol = "https:";
	}

	if (!parsed.hostname) {
		return "";
	}

	if (!parsed.pathname || parsed.pathname === "/") {
		parsed.pathname = DEFAULT_PATH;
	}

	return parsed.toString().replace(/\/$/, "");
}

function getStoredUrl() {
	const raw = store.get("serverUrl", "");
	const normalized = ensureUrl(raw);
	if (!normalized) {
		return "";
	}
	return normalized;
}

function createWindow() {
	mainWindow = new BrowserWindow({
		height: 900,
		width: 1400,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
			spellcheck: false,
		},
		backgroundColor: "#101828",
		show: false,
	});

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: "deny" };
	});

	mainWindow.webContents.on("did-fail-load", (_event, errorCode) => {
		if (errorCode === -3) {
			return;
		}
		loadOffline();
	});

	mainWindow.once("ready-to-show", () => {
		mainWindow.show();
	});

	const target = getStoredUrl();
	if (target) {
		loadServer(target);
	} else {
		loadSetup();
	}
}

function loadSetup() {
	const setupPath = path.join(__dirname, "renderer", "setup.html");
	mainWindow.loadFile(setupPath);
}

function loadOffline() {
	const offlinePath = path.join(__dirname, "renderer", "offline.html");
	mainWindow.loadFile(offlinePath);
}

function loadServer(serverUrl) {
	const normalized = ensureUrl(serverUrl);
	if (!normalized) {
		loadSetup();
		return;
	}

	store.set("serverUrl", normalized);
	mainWindow.loadURL(normalized);
}

async function probeServer() {
	const url = getStoredUrl();
	if (!url) {
		return { reachable: false, message: "No server URL configured" };
	}

	return new Promise((resolve) => {
		const request = net.request({ method: "HEAD", url });
		request.on("response", (response) => {
			resolve({ reachable: true, status: response.statusCode, url });
		});
		request.on("error", (error) => {
			resolve({ reachable: false, message: error.message });
		});
		request.end();
	});
}

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.whenReady().then(() => {
	app.setAppUserModelId("com.posawesome.desktop");
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

ipcMain.handle("get-server-url", () => {
	return store.get("serverUrl", "");
});

ipcMain.handle("normalize-server-url", (_event, value) => ensureUrl(value));

ipcMain.handle("set-server-url", (_event, value) => {
	const normalized = ensureUrl(value);
	if (!normalized) {
		throw new Error("Please provide a valid server URL (e.g. https://example.com)");
	}
	loadServer(normalized);
	return normalized;
});

ipcMain.handle("retry-load", () => {
	const url = getStoredUrl();
	if (!url) {
		loadSetup();
		return { launched: false };
	}
	loadServer(url);
	return { launched: true, url };
});

ipcMain.handle("open-settings", () => {
	loadSetup();
	return { opened: true };
});

ipcMain.handle("probe-server", async () => probeServer());

ipcMain.handle("reset-server", () => {
	store.delete("serverUrl");
	loadSetup();
});
