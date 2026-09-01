/**
 * Electron 预加载脚本（Preload Script）。
 *
 * 运行在隔离的上下文环境中，通过 contextBridge 安全地将主进程受控能力
 * 暴露给渲染进程，避免直接向前端注入完整的 Node.js 环境以保障安全性。
 */
const { contextBridge, ipcRenderer } = require('electron');

// 预加载层只允许调用这三个固定频道，不向页面暴露通用 ipcRenderer。
const IPC_CHANNELS = Object.freeze({
  getVersion: 'app:get-version',
  getLatestRelease: 'updates:get-latest-release',
  checkForUpdates: 'updates:check'
});

// 向渲染层 window 暴露 appUpdates 命名空间，提供版本查询与更新能力
contextBridge.exposeInMainWorld('appUpdates', Object.freeze({
  /**
   * 获取当前运行的应用版本号
   * @returns {Promise<string>} 语义化版本号字符串
   */
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.getVersion),

  /**
   * 从 GitHub Releases API 获取最新发布的版本信息和更新日志
   * @returns {Promise<{version: string, title: string, notes: string, publishedAt: string|null, url: string|null, isNewer: boolean}>}
   */
  getLatestRelease: () => ipcRenderer.invoke(IPC_CHANNELS.getLatestRelease),

  /**
   * 触发更新检查（手动触发）
   * @returns {Promise<{status: string, currentVersion: string, latestVersion?: string, version?: string, message?: string}>}
   */
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates)
}));
