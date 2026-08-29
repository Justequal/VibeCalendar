/**
 * Electron 主进程入口。
 *
 * 主进程只负责窗口生命周期和操作系统能力；日期、节假日和 DOM 逻辑全部留在
 * renderer 目录。渲染进程不需要 Node.js 权限，因此保持隔离与沙箱开启。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { checkForUpdates } = require('./updater');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 320,
    height: 480,
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  // 本应用没有打开外部页面或弹窗的需求。阻止这些行为可以避免本地页面被
  // 意外导航到具有不同信任级别的远程内容。
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  return mainWindow;
}

app.whenReady().then(() => {
  const mainWindow = createWindow();
  checkForUpdates(mainWindow);

  // macOS 关闭所有窗口后应用仍可驻留；点击 Dock 图标时重新创建窗口。
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
