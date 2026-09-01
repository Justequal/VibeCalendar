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
 * @param {{isPackaged?: boolean, dialogResponse?: number, currentVersion?: string, nextVersion?: string, checkForUpdatesImpl?: Function}} options
 */
function loadUpdater({
  isPackaged = true,
  dialogResponse = 0,
  currentVersion = '1.1.1',
  nextVersion = '1.1.1',
  checkForUpdatesImpl
} = {}) {
  const autoUpdater = new EventEmitter();
  let checkCount = 0;
  let quitCount = 0;
  let quitArguments;
  const dialogs = [];

  autoUpdater.checkForUpdates = async () => {
    checkCount += 1;
    if (checkForUpdatesImpl) return checkForUpdatesImpl();
    return { updateInfo: { version: nextVersion } };
  };
  autoUpdater.quitAndInstall = (...args) => {
    quitCount += 1;
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
      getQuitCount: () => quitCount,
      getQuitArguments: () => quitArguments
    };
  } finally {
    Module._load = originalLoad;
  }
}

function createReleaseResponse(version, body = '优化了一些功能') {
  return {
    ok: true,
    json: async () => ({
      tag_name: `v${version}`,
      name: `VibeCalendar v${version}`,
      body,
      published_at: '2026-09-01T00:00:00Z',
      html_url: `https://github.com/Justequal/VibeCalendar/releases/tag/v${version}`
    })
  };
}

async function withMockFetch(fetchImpl, callback) {
  const originalFetch = global.fetch;
  global.fetch = fetchImpl;
  try {
    return await callback();
  } finally {
    global.fetch = originalFetch;
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
  assert.equal(subject.getQuitCount(), 1);
  assert.deepEqual(subject.getQuitArguments(), [false, true]);
});

test('同一下载完成事件重复到达时只显示一次安装提示', async () => {
  const subject = loadUpdater({ dialogResponse: 1 });
  await subject.module.checkForUpdates();

  subject.autoUpdater.emit('update-downloaded', { version: '1.1.2' });
  subject.autoUpdater.emit('update-downloaded', { version: '1.1.2' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(subject.dialogs.length, 1);
  assert.equal(subject.getQuitCount(), 0);
});

test('开发版自动检查不访问更新服务', async () => {
  const subject = loadUpdater({ isPackaged: false });
  const result = await subject.module.checkForUpdates();
  assert.equal(subject.getCheckCount(), 0);
  assert.equal(result.status, 'development');
});

test('安装版允许用户重复手动检查更新', async () => {
  const subject = loadUpdater({ currentVersion: '1.1.0', nextVersion: '1.1.1' });

  await withMockFetch(async () => createReleaseResponse('1.1.1'), async () => {
    await subject.module.checkForUpdates(undefined, { manual: true });
    await subject.module.checkForUpdates(undefined, { manual: true });
  });

  assert.equal(subject.getCheckCount(), 2);
});

test('并发检查复用同一个更新请求，完成后允许再次检查', async () => {
  let finishCheck;
  const pendingCheck = new Promise((resolve) => {
    finishCheck = resolve;
  });
  const subject = loadUpdater({
    currentVersion: '1.1.0',
    checkForUpdatesImpl: () => pendingCheck
  });

  await withMockFetch(async () => createReleaseResponse('1.1.1'), async () => {
    const first = subject.module.checkForUpdates(undefined, { manual: true });
    const second = subject.module.checkForUpdates(undefined, { manual: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(subject.getCheckCount(), 1);

    finishCheck({ updateInfo: { version: '1.1.1' } });
    const results = await Promise.all([first, second]);
    assert.deepEqual(results[0], results[1]);

    await subject.module.checkForUpdates(undefined, { manual: true });
    assert.equal(subject.getCheckCount(), 2);
  });
});

test('安装版检查到新版本时返回 available 状态及版本号', async () => {
  const subject = loadUpdater({ currentVersion: '1.1.0', nextVersion: '1.1.1' });

  await withMockFetch(async () => createReleaseResponse('1.1.1'), async () => {
    const result = await subject.module.checkForUpdates(undefined, { manual: true });
    assert.equal(result.status, 'available');
    assert.equal(result.latestVersion, '1.1.1');
    assert.equal(result.version, '1.1.1');
    assert.equal(result.downloadStarted, true);
  });
});

test('下载器元数据缺失时仍按正式 Release 正确报告新版本', async () => {
  const subject = loadUpdater({
    currentVersion: '1.1.0',
    checkForUpdatesImpl: () => null
  });

  await withMockFetch(async () => createReleaseResponse('1.1.1'), async () => {
    const result = await subject.module.checkForUpdates(undefined, { manual: true });
    assert.equal(result.status, 'available');
    assert.equal(result.latestVersion, '1.1.1');
    assert.equal(result.downloadStarted, false);
  });
});

test('手动检查已是最新版时不启动下载器', async () => {
  const subject = loadUpdater({ currentVersion: '1.1.1', nextVersion: '1.1.1' });

  await withMockFetch(async () => createReleaseResponse('1.1.1'), async () => {
    const result = await subject.module.checkForUpdates(undefined, { manual: true });
    assert.equal(result.status, 'up-to-date');
    assert.equal(result.latestVersion, '1.1.1');
    assert.equal(subject.getCheckCount(), 0);
  });
});

test('版本比较支持不同长度的语义版本号', () => {
  const subject = loadUpdater();

  assert.equal(subject.module.compareVersions('1.2.0', '1.1.9'), 1);
  assert.equal(subject.module.compareVersions('1.1.1', '1.1.0'), 1);
  assert.equal(subject.module.compareVersions('1.1', '1.1.0'), 0);
  assert.equal(subject.module.compareVersions('1.0.9', '1.1.0'), -1);
});

test('版本比较正确处理 v 前缀、预发布版本与构建元数据', () => {
  const subject = loadUpdater();

  assert.equal(subject.module.compareVersions('v1.2.0', '1.2.0'), 0);
  assert.equal(subject.module.compareVersions('1.2.0-rc.1', '1.2.0'), -1);
  assert.equal(subject.module.compareVersions('1.2.0-beta.11', '1.2.0-beta.2'), 1);
  assert.equal(subject.module.compareVersions('1.2.0+build.9', '1.2.0+build.1'), 0);
  assert.throws(
    () => subject.module.compareVersions('not-a-version', '1.2.0'),
    /无效的版本号/
  );
});

test('获取 GitHub 最新 Release 信息能够正确解析版本与更新日志', async () => {
  const subject = loadUpdater({ currentVersion: '1.1.0' });
  const originalFetch = global.fetch;

  // 模拟 GitHub Releases API 返回数据
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      tag_name: 'v1.1.1',
      name: 'VibeCalendar v1.1.1',
      body: '- 增加更新公告弹窗\n- 增加手动检查更新按钮',
      published_at: '2026-08-30T16:00:00Z',
      html_url: 'https://github.com/Justequal/VibeCalendar/releases/tag/v1.1.1'
    })
  });

  try {
    const release = await subject.module.getLatestRelease();
    assert.equal(release.version, '1.1.1');
    assert.equal(release.title, 'VibeCalendar v1.1.1');
    assert.match(release.notes, /增加更新公告弹窗/);
    assert.equal(release.isNewer, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('最新 Release 请求支持并发去重、短时缓存与强制刷新', async () => {
  const subject = loadUpdater({ currentVersion: '1.1.0' });
  const originalFetch = global.fetch;
  let fetchCount = 0;

  global.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      json: async () => ({
        tag_name: 'v1.1.1',
        name: 'v1.1.1',
        body: '更新说明',
        html_url: 'https://github.com/Justequal/VibeCalendar/releases/tag/v1.1.1'
      })
    };
  };

  try {
    const [first, second] = await Promise.all([
      subject.module.getLatestRelease(),
      subject.module.getLatestRelease()
    ]);
    const cached = await subject.module.getLatestRelease();

    assert.equal(fetchCount, 1);
    assert.equal(first, second);
    assert.equal(cached, first);

    await subject.module.getLatestRelease({ forceRefresh: true });
    assert.equal(fetchCount, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('最新 Release 会拒绝无效版本，并过滤非 GitHub HTTPS 链接', async () => {
  const originalFetch = global.fetch;

  try {
    let subject = loadUpdater();
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ tag_name: 'latest' })
    });
    await assert.rejects(subject.module.getLatestRelease(), /无效的版本号/);

    subject = loadUpdater();
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'v1.1.1',
        html_url: 'javascript:alert(1)'
      })
    });
    const release = await subject.module.getLatestRelease();
    assert.equal(release.url, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('最新 Release 请求失败后会清理并发状态并允许重试', async () => {
  const subject = loadUpdater();
  const originalFetch = global.fetch;
  let fetchCount = 0;

  global.fetch = async () => {
    fetchCount += 1;
    if (fetchCount === 1) return { ok: false, status: 503 };
    return {
      ok: true,
      json: async () => ({ tag_name: 'v1.1.1' })
    };
  };

  try {
    await assert.rejects(subject.module.getLatestRelease(), /HTTP 503/);
    const release = await subject.module.getLatestRelease();
    assert.equal(fetchCount, 2);
    assert.equal(release.version, '1.1.1');
  } finally {
    global.fetch = originalFetch;
  }
});
