/**
 * Electron 主进程入口。
 *
 * 主进程只负责窗口生命周期和操作系统能力；日期、节假日和 DOM 逻辑全部留在
 * renderer 目录。渲染进程不需要 Node.js 权限，因此保持隔离与沙箱开启。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { checkForUpdates } = require('./updater');

// 禁用硬件加速：防止在特定 Windows 显卡环境下 GPU 进程崩溃 (0xC0000005)
app.disableHardwareAcceleration();

/**
 * 创建主应用窗口
 * @returns {BrowserWindow} 创建的窗口实例
 */
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 340,
    height: 500,
    title: 'Vibe Calendar', // 应用窗口标题
    center: true, // 启动时在屏幕正中央居中显示
    show: true, // 创建后立即显示，杜绝隐藏等待导致的假死问题
    alwaysOnTop: true, // 初始启动时强制置顶，确保弹到所有应用窗口最上方
    frame: false, // 现代无边框沉浸式窗口
    resizable: false, // 固定尺寸
    icon: path.join(__dirname, '../assets/icon.png'), // 任务栏与窗口使用高清 PNG 图标
    backgroundColor: '#16161d', // 统一暗夜背景色，杜绝闪烁并提供最佳对比度
    hasShadow: true, // 启用原生窗口投影
    webPreferences: {
      nodeIntegration: false, // 禁用 Node.js API 注入，保障安全性
      contextIsolation: true, // 开启上下文隔离
      sandbox: true, // 开启沙箱环境
      webSecurity: true // 开启标准网络安全策略
    }
  });

  // 本应用没有打开外部页面或弹窗的需求。阻止这些行为可以避免本地页面被意外导航到具有不同信任级别的远程内容。
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  // 页面加载完成后主动聚焦，并在 1.5 秒后解除强制置顶，恢复正常层级
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.focus();
    setTimeout(() => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(false);
      }
    }, 1500);
  });

  // 加载前端页面
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  return mainWindow;
}

// Electron 完成初始化后创建窗口并检查更新
app.whenReady().then(() => {
  console.log('🚀 Electron app.whenReady 完成，开始创建窗口...');
  const mainWindow = createWindow();
  checkForUpdates(mainWindow);

  // macOS 关闭所有窗口后应用仍可驻留；点击 Dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 当所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
