const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Remove the menu bar
    win.setMenuBarVisibility(false);

    const savedUrl = store.get('pos_url');
    if (savedUrl) {
        // Navigate to the POS app URL
        // Append /app/posawesome if not present, simple heuristic
        let targetUrl = savedUrl;
        if (!targetUrl.endsWith('/app/posawesome')) {
            targetUrl = targetUrl.replace(/\/$/, '') + '/app/posawesome';
        }
        win.loadURL(targetUrl);
    } else {
        win.loadFile(path.join(__dirname, 'setup.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC handler to save URL
ipcMain.handle('save-url', (event, url) => {
    // Basic validation
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }
    store.set('pos_url', url);
    // Reload the window to the new URL
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
        let targetUrl = url;
        if (!targetUrl.endsWith('/app/posawesome')) {
            targetUrl = targetUrl.replace(/\/$/, '') + '/app/posawesome';
        }
        win.loadURL(targetUrl);
    }
});

// IPC handler to reset URL (e.g. from menu or error page? - keeping it simple for now)
ipcMain.handle('reset-url', () => {
    store.delete('pos_url');
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
        win.loadFile(path.join(__dirname, 'setup.html'));
    }
});
