/**
 * Electron 主进程入口。
 *
 * 主进程只负责窗口生命周期和操作系统能力；日期、节假日和 DOM 逻辑全部留在
 * renderer 目录。渲染进程不需要 Node.js 权限，因此保持隔离与沙箱开启。
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const {
  checkForUpdates,
  getCurrentRelease,
  getUpdateState,
  installUpdate
} = require('./updater');

const LIVE_PREVIEW_ENABLED = process.argv.includes('--live-preview');
const RENDERER_DIRECTORY = path.join(__dirname, '../renderer');
const RENDERER_ENTRY_PATH = path.resolve(RENDERER_DIRECTORY, 'index.html');
const IPC_CHANNELS = Object.freeze({
  getVersion: 'app:get-version',
  getCurrentRelease: 'updates:get-current-release',
  getUpdateState: 'updates:get-state',
  checkForUpdates: 'updates:check',
  installUpdate: 'updates:install'
});
let ipcHandlersRegistered = false;
let mainWindow = null;

// 禁用硬件加速：防止在特定 Windows 显卡环境下 GPU 进程崩溃 (0xC0000005)
app.disableHardwareAcceleration();

// 桌面快捷方式、开始菜单和更新后的自动重启可能在很短时间内重复启动程序。
// 单实例锁保证系统里只有一个日历窗口；后启动的进程只负责唤醒已有窗口。
const hasSingleInstanceLock = app.requestSingleInstanceLock();

function isTrustedRenderer(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.();
  if (!senderUrl) return false;

  try {
    const senderPath = path.resolve(fileURLToPath(senderUrl));
    return process.platform === 'win32'
      ? senderPath.toLowerCase() === RENDERER_ENTRY_PATH.toLowerCase()
      : senderPath === RENDERER_ENTRY_PATH;
  } catch {
    return false;
  }
}

function fromTrustedRenderer(handler) {
  return (event, ...args) => {
    if (!isTrustedRenderer(event)) {
      throw new Error('拒绝来自非应用页面的更新请求');
    }
    return handler(event, ...args);
  };
}

/**
 * 注册主进程与渲染进程之间的最小 IPC 接口，并校验调用页面来源。
 * 重复调用不会重复注册处理器，便于测试或未来拆分应用初始化流程。
 */
function registerIpcHandlers() {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  ipcMain.handle(
    IPC_CHANNELS.getVersion,
    fromTrustedRenderer(() => app.getVersion())
  );
  ipcMain.handle(
    IPC_CHANNELS.getCurrentRelease,
    fromTrustedRenderer(() => getCurrentRelease())
  );
  ipcMain.handle(
    IPC_CHANNELS.getUpdateState,
    fromTrustedRenderer(() => getUpdateState())
  );
  ipcMain.handle(
    IPC_CHANNELS.checkForUpdates,
    fromTrustedRenderer((event) => checkForUpdates(
      BrowserWindow.fromWebContents(event.sender),
      { manual: true }
    ))
  );
  ipcMain.handle(
    IPC_CHANNELS.installUpdate,
    fromTrustedRenderer(() => installUpdate())
  );
}

/**
 * 开发模式下监听前端文件，保存后自动刷新 Electron 窗口。
 * 监听器与窗口生命周期绑定，正式启动和安装包不会创建文件监听。
 */
function enableLivePreview(mainWindow) {
  if (!LIVE_PREVIEW_ENABLED) return;

  let reloadTimer;
  const watcher = fs.watch(
    RENDERER_DIRECTORY,
    { recursive: true },
    (eventType, filename) => {
      if (!filename || !/\.(?:html|css|js|json)$/i.test(filename)) return;

      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        if (mainWindow.isDestroyed()) return;
        console.log(`🔄 前端文件已更新，刷新预览：${filename}`);
        mainWindow.webContents.reloadIgnoringCache();
      }, 100);
    }
  );

  watcher.on('error', (error) => {
    console.error('实时预览文件监听失败：', error);
  });

  mainWindow.once('closed', () => {
    clearTimeout(reloadTimer);
    watcher.close();
  });

  console.log('👀 实时预览已启用，正在监听 src/renderer');
}

/**
 * 创建主应用窗口
 * @returns {BrowserWindow} 创建的窗口实例
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 340,
    height: 500,
    title: 'VibeCalendar', // 品牌名在中英文界面中保持一致
    center: true, // 启动时在屏幕正中央居中显示
    show: true, // 创建后立即显示，杜绝隐藏等待导致的假死问题
    alwaysOnTop: true, // 初始启动时强制置顶，确保弹到所有应用窗口最上方
    frame: false, // 现代无边框沉浸式窗口
    resizable: false, // 固定尺寸
    icon: path.join(__dirname, '../assets/icon.png'), // 任务栏与窗口使用高清 PNG 图标
    backgroundColor: '#16161d', // 统一暗夜背景色，杜绝闪烁并提供最佳对比度
    hasShadow: true, // 启用原生窗口投影
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
  mainWindow.loadFile(RENDERER_ENTRY_PATH);
  enableLivePreview(mainWindow);
  return mainWindow;
}

/** 将已经存在的窗口恢复到用户面前，供重复启动和 macOS 激活事件复用。 */
function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized?.()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return true;
}

if (!hasSingleInstanceLock) {
  // 另一个实例已经持有窗口；当前进程无需继续注册 IPC 或启动更新检查。
  app.quit();
} else {
  app.on('second-instance', revealMainWindow);

  // Electron 完成初始化后创建窗口并检查更新。
  app.whenReady().then(() => {
    console.log('🚀 Electron app.whenReady 完成，开始创建窗口...');
    registerIpcHandlers();
    const createdWindow = createWindow();
    void checkForUpdates(createdWindow);

    // macOS 关闭所有窗口后应用仍可驻留；点击 Dock 图标时重新创建窗口。
    app.on('activate', () => {
      if (!revealMainWindow()) createWindow();
    });
  });
}

// 当所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
