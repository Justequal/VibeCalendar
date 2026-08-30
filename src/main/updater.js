/**
 * 应用自动更新与版本检查模块。
 *
 * 核心逻辑：
 * 1. 安装版启动后静默检查并在后台下载更新包。下载完成后提示用户选择“立即重启安装”或“稍后在退出时安装”。
 * 2. 支持手动检查更新（通过前端“检查更新”按钮触发），提供明确的当前状态反馈。
 * 3. 支持从 GitHub Releases API 查询最新版本发布日志，供版本号点击弹窗使用。
 */
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const packageMetadata = require('../../package.json');

// 是否已初始化 autoUpdater 监听事件
let updaterInitialized = false;
// 正在进行的更新检查 Promise，避免并发重复请求
let updateCheckPromise = null;
// 主窗口引用，用于模态弹窗挂载
let updateParentWindow = null;

// GitHub 最新 Release 接口地址
const LATEST_RELEASE_URL = 'https://api.github.com/repos/Justequal/VibeCalendar/releases/latest';

/**
 * 获取 package.json 中配置的发布配置数组
 * @returns {Array<object|string>}
 */
function getPublishConfigs() {
  const publish = packageMetadata.build?.publish;
  return Array.isArray(publish) ? publish : [publish].filter(Boolean);
}

/**
 * 判断是否正确配置了自动更新发布源
 * @returns {boolean}
 */
function isUpdateConfigured() {
  return getPublishConfigs().some((config) => (
    config === 'github'
    || (
      config?.provider === 'github'
      && config.owner !== 'YourUsername'
    )
  ));
}

/**
 * 在指定窗口或顶层弹出原生消息框
 * @param {import('electron').BrowserWindow|null} parentWindow 目标父窗口
 * @param {import('electron').MessageBoxOptions} options 对话框选项
 * @returns {Promise<import('electron').MessageBoxReturnValue>}
 */
function showDialog(parentWindow, options) {
  return parentWindow && !parentWindow.isDestroyed()
    ? dialog.showMessageBox(parentWindow, options)
    : dialog.showMessageBox(options);
}

/**
 * 语义化版本号比较函数
 * @param {string} left 左侧版本号
 * @param {string} right 右侧版本号
 * @returns {number} 1 表示 left > right；-1 表示 left < right；0 表示版本相等
 */
function compareVersions(left, right) {
  const leftParts = String(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

/**
 * 初始化 electron-updater 事件监听器
 * @param {import('electron').BrowserWindow|null} parentWindow
 */
function initializeAutoUpdater(parentWindow) {
  updateParentWindow = parentWindow || updateParentWindow;
  if (updaterInitialized) return;

  updaterInitialized = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('update-available', (info) => {
    console.info(`发现氛围日历 v${info.version}，正在后台下载。`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    try {
      const result = await showDialog(updateParentWindow, {
        type: 'info',
        title: '更新准备就绪',
        message: `氛围日历 v${info.version} 已准备就绪。`,
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
    console.error('自动更新检查失败：', error);
  });
}

/**
 * 从 GitHub API 请求最新的 Release 元数据与更新日志
 * @returns {Promise<{version: string, title: string, notes: string, publishedAt: string|null, url: string|null, isNewer: boolean}>}
 */
async function getLatestRelease() {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `VibeCalendar/${app.getVersion()}`
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub Release API HTTP ${response.status}`);
  }

  const release = await response.json();
  const version = String(release.tag_name || '').replace(/^v/i, '');
  if (!version) throw new Error('最新 Release 缺少版本标签');

  return {
    version,
    title: release.name || `v${version}`,
    notes: String(release.body || '').trim(),
    publishedAt: release.published_at || null,
    url: release.html_url || null,
    isNewer: compareVersions(version, app.getVersion()) > 0
  };
}

/**
 * 检查应用更新
 * @param {import('electron').BrowserWindow|null} parentWindow
 * @param {{manual?: boolean}} options manual 为 true 时表示由用户主动点击触发
 * @returns {Promise<{status: 'available'|'up-to-date'|'unavailable'|'development'|'error', currentVersion: string, latestVersion?: string, version?: string, reason?: string, message?: string, development?: boolean}>}
 */
async function checkForUpdates(parentWindow, { manual = false } = {}) {
  const currentVersion = app.getVersion();
  if (!isUpdateConfigured()) {
    console.info('自动更新未启用：发布仓库尚未配置。');
    return { status: 'unavailable', currentVersion, reason: 'not-configured' };
  }

  // 开发环境下跳过 electron-updater 的安装包下载逻辑
  if (!app.isPackaged) {
    console.info('自动安装在开发模式下禁用。');
    if (!manual) return { status: 'development', currentVersion };

    try {
      const release = await getLatestRelease();
      return {
        status: release.isNewer ? 'available' : 'up-to-date',
        currentVersion,
        latestVersion: release.version,
        version: release.version,
        development: true
      };
    } catch (error) {
      console.error('开发模式检查最新 Release 失败：', error);
      return { status: 'error', currentVersion, message: error.message };
    }
  }

  // 正式打包环境下使用 autoUpdater 进行更新检查与后台下载
  initializeAutoUpdater(parentWindow);
  if (updateCheckPromise) return updateCheckPromise;

  updateCheckPromise = (async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      const latestVersion = result?.updateInfo?.version || currentVersion;
      return {
        status: compareVersions(latestVersion, currentVersion) > 0
          ? 'available'
          : 'up-to-date',
        currentVersion,
        latestVersion,
        version: latestVersion
      };
    } catch (error) {
      console.error('无法启动自动更新检查：', error);
      return { status: 'error', currentVersion, message: error.message };
    } finally {
      updateCheckPromise = null;
    }
  })();

  return updateCheckPromise;
}

module.exports = {
  checkForUpdates,
  compareVersions,
  getLatestRelease,
  isUpdateConfigured
};
