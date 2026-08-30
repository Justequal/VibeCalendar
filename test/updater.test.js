/**
 * 自动更新与版本检查单元测试。
 *
 * 验证：
 * 1. 安装版与开发版在自动/手动检查更新时的行为差异；
 * 2. 版本号比较算法的正确性；
 * 3. 获取最新 GitHub Release 公告的数据解析与新版本判断。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const path = require('node:path');

/**
 * 模拟加载 updater.js 模块，隔离 Electron 原生依赖
 * @param {{isPackaged?: boolean, dialogResponse?: number, currentVersion?: string, nextVersion?: string}} options
 */
function loadUpdater({
  isPackaged = true,
  dialogResponse = 0,
  currentVersion = '1.1.1',
  nextVersion = '1.1.1'
} = {}) {
  const autoUpdater = new EventEmitter();
  let checkCount = 0;
  let quitArguments;
  const dialogs = [];

  autoUpdater.checkForUpdates = async () => {
    checkCount += 1;
    return { updateInfo: { version: nextVersion } };
  };
  autoUpdater.quitAndInstall = (...args) => {
    quitArguments = args;
  };

  const electron = {
    app: {
      isPackaged,
      getVersion: () => currentVersion
    },
    dialog: {
      showMessageBox: async (...args) => {
        dialogs.push(args.at(-1));
        return { response: dialogResponse };
      }
    }
  };

  const updaterPath = path.resolve(__dirname, '../src/main/updater.js');
  delete require.cache[updaterPath];
  const originalLoad = Module._load;
  Module._load = function mockElectronModules(request, parent, isMain) {
    if (request === 'electron') return electron;
    if (request === 'electron-updater') return { autoUpdater };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return {
      module: require(updaterPath),
      autoUpdater,
      dialogs,
      getCheckCount: () => checkCount,
      getQuitArguments: () => quitArguments
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('安装版静默下载更新，只在准备完成后提醒安装', async () => {
  const subject = loadUpdater();
  const parentWindow = { isDestroyed: () => false };

  assert.equal(subject.module.isUpdateConfigured(), true);
  const result = await subject.module.checkForUpdates(parentWindow);

  assert.equal(subject.getCheckCount(), 1);
  assert.equal(result.status, 'up-to-date');
  assert.equal(subject.autoUpdater.autoDownload, true);
  assert.equal(subject.autoUpdater.autoInstallOnAppQuit, true);
  assert.equal(subject.autoUpdater.allowPrerelease, false);

  subject.autoUpdater.emit('update-available', { version: '1.1.1' });
  assert.equal(subject.dialogs.length, 0);

  subject.autoUpdater.emit('update-downloaded', { version: '1.1.1' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(subject.dialogs.length, 1);
  assert.match(subject.dialogs[0].message, /v1\.1\.1/);
  assert.deepEqual(subject.getQuitArguments(), [false, true]);
});

test('开发版自动检查不访问更新服务', async () => {
  const subject = loadUpdater({ isPackaged: false });
  const result = await subject.module.checkForUpdates();
  assert.equal(subject.getCheckCount(), 0);
  assert.equal(result.status, 'development');
});

test('安装版允许用户重复手动检查更新', async () => {
  const subject = loadUpdater();

  await subject.module.checkForUpdates(undefined, { manual: true });
  await subject.module.checkForUpdates(undefined, { manual: true });

  assert.equal(subject.getCheckCount(), 2);
});

test('安装版检查到新版本时返回 available 状态及版本号', async () => {
  const subject = loadUpdater({ currentVersion: '1.1.0', nextVersion: '1.1.1' });

  const result = await subject.module.checkForUpdates(undefined, { manual: true });
  assert.equal(result.status, 'available');
  assert.equal(result.latestVersion, '1.1.1');
  assert.equal(result.version, '1.1.1');
});

test('版本比较支持不同长度的语义版本号', () => {
  const subject = loadUpdater();

  assert.equal(subject.module.compareVersions('1.2.0', '1.1.9'), 1);
  assert.equal(subject.module.compareVersions('1.1.1', '1.1.0'), 1);
  assert.equal(subject.module.compareVersions('1.1', '1.1.0'), 0);
  assert.equal(subject.module.compareVersions('1.0.9', '1.1.0'), -1);
});

test('获取 GitHub 最新 Release 信息能够正确解析版本与更新日志', async () => {
  const subject = loadUpdater({ currentVersion: '1.1.0' });
  const originalFetch = global.fetch;

  // 模拟 GitHub Releases API 返回数据
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      tag_name: 'v1.1.1',
      name: '氛围日历 v1.1.1',
      body: '- 增加更新公告弹窗\n- 增加手动检查更新按钮',
      published_at: '2026-08-30T16:00:00Z',
      html_url: 'https://github.com/Justequal/VibeCalendar/releases/tag/v1.1.1'
    })
  });

  try {
    const release = await subject.module.getLatestRelease();
    assert.equal(release.version, '1.1.1');
    assert.equal(release.title, '氛围日历 v1.1.1');
    assert.match(release.notes, /增加更新公告弹窗/);
    assert.equal(release.isNewer, true);
  } finally {
    global.fetch = originalFetch;
  }
});
