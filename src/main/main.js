const { app, BrowserWindow } = require('electron');
const path = require('path');

// Handle Squirrel setup events to prevent the app from launching during installation
if (process.platform === 'win32') {
  const cmd = process.argv[1];
  if (cmd === '--squirrel-install' || cmd === '--squirrel-updated' || cmd === '--squirrel-uninstall' || cmd === '--squirrel-obsolete') {
    app.quit();
    return;
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 320,
    height: 480,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    // Frameless window for modern aesthetic
    transparent: true,
    frame: false,
    resizable: false,
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
