const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const url = process.env.ELECTRON_APP_URL || 'http://localhost:3001';
  let loadUrl = url;
  if (typeof loadUrl === 'string' && loadUrl.includes(':3000')) {
    const fallback = 'http://localhost:3001';
    console.warn(`ELECTRON_APP_URL appears to point to backend (${loadUrl}); switching to ${fallback}`);
    try {
      dialog.showMessageBoxSync({
        type: 'warning',
        title: 'ELECTRON_APP_URL apontando para backend',
        message: `O valor de ELECTRON_APP_URL (${loadUrl}) parece apontar para o backend. O app usará ${fallback} para carregar a interface.\n\nSe quiser alterar, defina ELECTRON_APP_URL antes de iniciar.`,
      });
    } catch (e) {
      // ignore dialog failures in headless environments
    }
    loadUrl = fallback;
  }

  win.loadURL(loadUrl).catch(() => {
    dialog.showErrorBox(
      'Frontend não disponível',
      `Não foi possível abrir ${loadUrl}. Inicie o frontend em http://localhost:3001 (npm run start) e tente novamente.`,
    );
  });

  // Optional: show devtools when in dev mode
  if (process.env.DEBUG_ELECTRON === 'true' || process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.on('ready', () => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// In packaged app, set protocol handling or other platform-specific features here.
