/**
 * 应用自动更新。
 *
 * 开发模式不检查更新；package.json 中仍是示例仓库时也主动跳过，避免每次
 * 启动都产生无意义的网络错误。配置方式见 README 的“自动更新”章节。
 */
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const packageMetadata = require('../../package.json');

function getPublishConfig() {
  const publish = packageMetadata.build?.publish;
  return Array.isArray(publish) ? publish[0] : publish;
}

function isUpdateConfigured() {
  const config = getPublishConfig();
  return Boolean(
    config
    && config.provider === 'github'
    && config.owner
    && config.owner !== 'YourUsername'
    && config.repo
  );
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

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.once('update-available', async (info) => {
    const result = await showDialog(parentWindow, {
      type: 'info',
      title: '发现新版本',
      message: `Vibe Calendar v${info.version} 已发布。`,
      detail: '是否立即下载？下载期间可以继续使用日历。',
      buttons: ['立即下载', '稍后提醒'],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      autoUpdater.downloadUpdate().catch((error) => {
        console.error('下载更新失败：', error);
      });
    }
  });

  autoUpdater.once('update-downloaded', async () => {
    const result = await showDialog(parentWindow, {
      type: 'info',
      title: '更新准备就绪',
      message: '新版本已经下载完成。',
      detail: '可以立即重启安装，也可以在下次退出应用时自动安装。',
      buttons: ['重启并安装', '稍后'],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
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
