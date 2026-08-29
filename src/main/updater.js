/**
 * 应用自动更新。
 *
 * 安装版启动后静默检查并在后台下载更新。只有安装包准备完成时才打扰用户，
 * 让用户选择立即重启安装，或在正常退出应用时自动安装。
 */
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const packageMetadata = require('../../package.json');

let updateCheckStarted = false;

function getPublishConfigs() {
  const publish = packageMetadata.build?.publish;
  return Array.isArray(publish) ? publish : [publish].filter(Boolean);
}

function isUpdateConfigured() {
  return getPublishConfigs().some((config) => (
    config === 'github'
    || (
      config?.provider === 'github'
      && config.owner !== 'YourUsername'
    )
  ));
}

function showDialog(parentWindow, options) {
  return parentWindow && !parentWindow.isDestroyed()
    ? dialog.showMessageBox(parentWindow, options)
    : dialog.showMessageBox(options);
}

function checkForUpdates(parentWindow) {
  if (!app.isPackaged || !isUpdateConfigured()) {
    console.info('自动更新未启用：当前为开发模式或发布仓库尚未配置。');
    return;
  }

  if (updateCheckStarted) return;

  updateCheckStarted = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.once('update-available', (info) => {
    console.info(`发现 Vibe Calendar v${info.version}，正在后台下载。`);
  });

  autoUpdater.once('update-downloaded', async (info) => {
    try {
      const result = await showDialog(parentWindow, {
        type: 'info',
        title: '更新准备就绪',
        message: `Vibe Calendar v${info.version} 已准备就绪。`,
        detail: '立即重启即可完成安装；选择“稍后”则会在你正常退出应用时自动安装。',
        buttons: ['重启并安装', '稍后'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      });

      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    } catch (error) {
      console.error('无法显示更新安装提示：', error);
    }
  });

  autoUpdater.on('error', (error) => {
    // 更新失败不影响核心功能，保留日志供排障即可。
    console.error('自动更新检查失败：', error);
  });

  autoUpdater.checkForUpdates().catch((error) => {
    console.error('无法启动自动更新检查：', error);
  });
}

module.exports = { checkForUpdates, isUpdateConfigured };
