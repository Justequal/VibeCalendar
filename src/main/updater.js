/**
 * 应用自动更新与版本检查模块。
 *
 * 核心逻辑：
 * 1. 安装版启动后静默检查并在后台下载更新包；下载完成后等待用户点击“更新 vX”安装。
 * 2. 手动检查统一通过 GitHub Release 判断“有新版 / 已是最新版”，不向用户暴露下载器能力差异。
 * 3. 支持从 GitHub Releases API 查询最新版本发布日志，供版本号点击弹窗使用。
 */
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const path = require('node:path');
const packageMetadata = require('../../package.json');
const { extractReleaseNotes } = require('./release-notes');

// 是否已初始化 autoUpdater 监听事件
let updaterInitialized = false;
// 正在进行的更新检查 Promise，避免并发重复请求
let updateCheckPromise = null;
// 正在进行的更新下载 Promise，避免启动检查与手动检查重复下载
let updateDownloadPromise = null;
// 主窗口引用，用于模态弹窗挂载
let updateParentWindow = null;
let downloadedUpdateVersion = null;
// Release 请求在短时间内复用，减少重复点击对 GitHub API 的压力
let latestReleaseCache = null;
let latestReleasePromise = null;

// GitHub 最新 Release 接口地址
const LATEST_RELEASE_URL = 'https://api.github.com/repos/Justequal/VibeCalendar/releases/latest';
const RELEASE_CACHE_TTL_MS = 5 * 60 * 1000;
const RELEASE_REQUEST_TIMEOUT_MS = 10 * 1000;
const MAX_RELEASE_TITLE_LENGTH = 200;
const MAX_RELEASE_NOTES_LENGTH = 100_000;
const CHANGELOG_PATH = path.resolve(__dirname, '../../CHANGELOG.md');
const UPDATE_STATUS_CHANNEL = 'updates:status';

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
 * 仅保留 GitHub HTTPS Release 链接，避免未来在界面中使用远端链接时扩大信任边界。
 * @param {unknown} value
 * @returns {string|null}
 */
function getSafeReleaseUrl(value) {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function getErrorMessage(error) {
  return error instanceof Error && error.message
    ? error.message
    : '未知更新错误';
}

// 解析 UI 与更新服务可能返回的 v1.2.3、预发布版本和构建元数据。
function parseVersion(value) {
  const match = String(value).trim().match(
    /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9a-z-]+(?:\.[0-9a-z-]+)*))?(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i
  );
  if (!match) {
    throw new TypeError(`无效的版本号：${value}`);
  }

  const core = match.slice(1, 4).map((part) => Number(part || 0));
  const prerelease = match[4]
    ? match[4].split('.').map((identifier) => (
      /^\d+$/.test(identifier) ? Number(identifier) : identifier
    ))
    : [];
  if (
    core.some((part) => !Number.isSafeInteger(part))
    || prerelease.some((identifier) => (
      typeof identifier === 'number' && !Number.isSafeInteger(identifier)
    ))
  ) {
    throw new TypeError(`无效的版本号：${value}`);
  }

  return { core, prerelease };
}

// 按 SemVer 规则比较连字符后的预发布标识。
function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0) {
    if (left.length === right.length) return 0;
    return left.length === 0 ? 1 : -1;
  }

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];

    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === undefined ? -1 : 1;
    }
    if (leftIdentifier === rightIdentifier) continue;

    const leftIsNumber = typeof leftIdentifier === 'number';
    const rightIsNumber = typeof rightIdentifier === 'number';
    if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }
  return 0;
}

/**
 * 按语义化版本规则比较版本号（兼容开头的 v、预发布标识和构建元数据）。
 * @param {string} left 左侧版本号
 * @param {string} right 右侧版本号
 * @returns {number} 1 表示 left > right；-1 表示 left < right；0 表示版本相等
 */
function compareVersions(left, right) {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);

  for (let index = 0; index < leftVersion.core.length; index += 1) {
    const difference = leftVersion.core[index] - rightVersion.core[index];
    if (difference !== 0) return Math.sign(difference);
  }

  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}

/**
 * 读取安装包内与当前应用版本完全对应的维护记录。
 * 该路径不访问网络，因此版本号按钮始终展示当前版本而不是远端最新版本。
 */
function getCurrentRelease() {
  const version = app.getVersion();
  const notes = extractReleaseNotes(fs.readFileSync(CHANGELOG_PATH, 'utf8'), version);
  return Object.freeze({
    version,
    title: `VibeCalendar v${version}`,
    notes: notes.slice(0, MAX_RELEASE_NOTES_LENGTH),
    publishedAt: null,
    url: `https://github.com/Justequal/VibeCalendar/releases/tag/v${version}`,
    isNewer: false
  });
}

function sendUpdateStatus(status) {
  const webContents = updateParentWindow?.webContents;
  if (
    !updateParentWindow
    || updateParentWindow.isDestroyed()
    || !webContents
    || webContents.isDestroyed?.()
  ) return;

  webContents.send(UPDATE_STATUS_CHANNEL, Object.freeze(status));
}

/**
 * 初始化 electron-updater 事件监听器
 * @param {import('electron').BrowserWindow|null} parentWindow
 */
function initializeAutoUpdater(parentWindow) {
  updateParentWindow = parentWindow || updateParentWindow;
  if (updaterInitialized) return;

  updaterInitialized = true;
  // 下载由本模块在确认版本后显式启动，避免仅检查到新版却没有开始下载。
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('update-available', (info) => {
    const version = String(info?.version || '').trim();
    console.info(`发现 VibeCalendar v${version || '新版'}，正在后台下载。`);
    sendUpdateStatus({ phase: 'available', version });
  });

  autoUpdater.on('download-progress', (progress) => {
    const rawPercent = Number(progress?.percent);
    const percent = Number.isFinite(rawPercent)
      ? Math.min(100, Math.max(0, rawPercent))
      : 0;
    sendUpdateStatus({
      phase: 'downloading',
      percent,
      transferred: Number.isFinite(Number(progress?.transferred)) ? Number(progress.transferred) : 0,
      total: Number.isFinite(Number(progress?.total)) ? Number(progress.total) : 0
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    const downloadedVersion = String(info?.version || '').trim();
    downloadedUpdateVersion = downloadedVersion || downloadedUpdateVersion || 'unknown-version';
    sendUpdateStatus({ phase: 'downloaded', version: downloadedVersion, percent: 100 });
  });

  autoUpdater.on('error', (error) => {
    console.error('自动更新检查失败：', error);
    sendUpdateStatus({ phase: 'error' });
  });
}

/** 在渲染层明确点击“更新 vX”后安装已下载的增量包。 */
function installUpdate() {
  if (!downloadedUpdateVersion) return { status: 'not-ready' };
  autoUpdater.quitAndInstall(false, true);
  return { status: 'installing', version: downloadedUpdateVersion };
}

/**
 * 从 GitHub API 请求最新的 Release 元数据与更新日志
 * @param {{forceRefresh?: boolean}} options 是否跳过短时缓存
 * @returns {Promise<{version: string, title: string, notes: string, publishedAt: string|null, url: string|null, isNewer: boolean}>}
 */
async function getLatestRelease({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (
    !forceRefresh
    && latestReleaseCache
    && now - latestReleaseCache.fetchedAt < RELEASE_CACHE_TTL_MS
  ) {
    return latestReleaseCache.release;
  }
  if (latestReleasePromise) return latestReleasePromise;

  latestReleasePromise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RELEASE_REQUEST_TIMEOUT_MS);
    timeout.unref?.();

    try {
      const response = await fetch(LATEST_RELEASE_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `VibeCalendar/${app.getVersion()}`
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`GitHub Release API HTTP ${response.status}`);
      }

      const release = await response.json();
      if (!release || typeof release !== 'object') {
        throw new Error('GitHub Release API 返回了无效数据');
      }

      const version = String(release.tag_name || '').trim().replace(/^v/i, '');
      // 版本比较同时完成格式校验，避免无效远端数据进入界面。
      const isNewer = compareVersions(version, app.getVersion()) > 0;
      const releaseTitle = String(release.name || '').trim() || `v${version}`;
      const parsedRelease = Object.freeze({
        version,
        title: releaseTitle.slice(0, MAX_RELEASE_TITLE_LENGTH),
        notes: String(release.body || '').trim().slice(0, MAX_RELEASE_NOTES_LENGTH),
        publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
        url: getSafeReleaseUrl(release.html_url),
        isNewer
      });

      latestReleaseCache = { fetchedAt: Date.now(), release: parsedRelease };
      return parsedRelease;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('请求最新版本信息超时', { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })();

  try {
    return await latestReleasePromise;
  } finally {
    latestReleasePromise = null;
  }
}

/** 显式启动并复用下载任务，不依赖 electron-updater 的隐式自动下载。 */
function startUpdateDownload() {
  if (!updateDownloadPromise) {
    updateDownloadPromise = Promise.resolve()
      .then(() => autoUpdater.downloadUpdate())
      .catch((error) => {
        sendUpdateStatus({ phase: 'error' });
        throw error;
      })
      .finally(() => {
        updateDownloadPromise = null;
      });
  }
  return updateDownloadPromise;
}

/** 合并所有 electron-updater 检查，并在发现新版后显式开始下载。 */
function startAutoUpdaterCheck(parentWindow) {
  initializeAutoUpdater(parentWindow);
  if (!updateCheckPromise) {
    updateCheckPromise = Promise.resolve()
      .then(() => autoUpdater.checkForUpdates())
      .then((result) => {
        const latestVersion = result?.updateInfo?.version;
        if (latestVersion && compareVersions(latestVersion, app.getVersion()) > 0) {
          void startUpdateDownload().catch((error) => {
            console.error('下载新版本失败：', error);
          });
        }
        return result;
      })
      .finally(() => {
        updateCheckPromise = null;
      });
  }
  return updateCheckPromise;
}

/**
 * 检查应用更新
 * @param {import('electron').BrowserWindow|null} parentWindow
 * @param {{manual?: boolean}} options manual 为 true 时表示由用户主动点击触发
 * @returns {Promise<{status: 'available'|'up-to-date'|'development'|'skipped'|'error', currentVersion: string, latestVersion?: string, version?: string, reason?: string, message?: string, development?: boolean, downloadStarted?: boolean}>}
 */
async function checkForUpdates(parentWindow, { manual = false } = {}) {
  const currentVersion = app.getVersion();

  // 用户主动检查时，版本结论只取决于最新正式 Release。这样即使下载器元数据
  // 尚未同步，也不会把“暂时无法下载”错误表述成“当前版本不能更新”。
  if (manual) {
    try {
      const release = await getLatestRelease({ forceRefresh: true });
      if (!release.isNewer) {
        return {
          status: 'up-to-date',
          currentVersion,
          latestVersion: release.version,
          version: release.version
        };
      }

      let downloadStarted = false;
      if (app.isPackaged && isUpdateConfigured()) {
        // 版本结论立即返回给界面；下载器独立在后台继续，不能阻塞按钮反馈。
        downloadStarted = true;
        void startAutoUpdaterCheck(parentWindow).catch((error) => {
          console.error('已发现新版本，但暂时无法启动后台下载：', error);
        });
      }

      return {
        status: 'available',
        currentVersion,
        latestVersion: release.version,
        version: release.version,
        downloadStarted
      };
    } catch (error) {
      console.error('检查最新 Release 失败：', error);
      return { status: 'error', currentVersion, message: getErrorMessage(error) };
    }
  }

  if (!isUpdateConfigured()) {
    console.info('自动更新未启用：发布仓库尚未配置。');
    return { status: 'skipped', currentVersion, reason: 'not-configured' };
  }

  // 开发环境下跳过 electron-updater 的安装包下载逻辑
  if (!app.isPackaged) {
    console.info('自动安装在开发模式下禁用。');
    return { status: 'development', currentVersion };
  }

  // 正式打包环境下使用 autoUpdater 进行更新检查与后台下载
  try {
    const result = await startAutoUpdaterCheck(parentWindow);
    const latestVersion = result?.updateInfo?.version;
    if (!latestVersion) {
      return {
        // 静默检查的返回值不展示给用户；缺少元数据不再被解释为“不支持更新”。
        status: 'up-to-date',
        currentVersion,
        reason: 'missing-update-info'
      };
    }
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
    return { status: 'error', currentVersion, message: getErrorMessage(error) };
  }
}

module.exports = {
  checkForUpdates,
  compareVersions,
  getCurrentRelease,
  getLatestRelease,
  isUpdateConfigured,
  installUpdate
};
