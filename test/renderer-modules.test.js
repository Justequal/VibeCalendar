const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserScript(filename, extraContext = {}) {
  const window = extraContext.window || {};
  const context = vm.createContext({
    window,
    console,
    clearTimeout: () => {},
    setTimeout: () => 1,
    ...extraContext
  });
  const source = fs.readFileSync(path.resolve(__dirname, `../src/renderer/${filename}`), 'utf8');
  vm.runInContext(source, context, { filename });
  return window;
}

function createElement() {
  const listeners = new Map();
  const attributes = new Map();
  const classes = new Map();
  const styles = new Map();

  return {
    textContent: '',
    title: '',
    hidden: false,
    disabled: false,
    addEventListener: (type, listener) => listeners.set(type, listener),
    dispatch: (type, event = {}) => listeners.get(type)?.(event),
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    getAttribute: (name) => attributes.get(name),
    style: {
      setProperty: (name, value) => styles.set(name, value),
      getPropertyValue: (name) => styles.get(name)
    },
    classList: {
      toggle: (name, enabled) => classes.set(name, enabled),
      contains: (name) => classes.get(name) === true
    },
    focus: () => {}
  };
}

const UPDATE_TEXT = Object.freeze({
  versionAnnouncement: '查看公告',
  checkUpdates: '检查更新',
  checkingUpdates: '正在检查',
  downloadingUpdate: '正在下载',
  updateFound: '发现新版本 v{version}',
  updateAvailable: '发现 v{version}',
  updateDownloading: '正在下载 v{version}：{percent}%',
  updateDownloaded: 'v{version} 下载完成',
  updateProgressLabel: '更新下载进度',
  updateNow: '更新 V{version} 版本',
  updating: '正在安装更新',
  upToDate: '已是最新',
  updateCheckError: '失败',
  releaseTitle: '更新公告',
  releaseLoading: '加载中',
  releaseNoNotes: '无说明',
  releaseLoadError: '公告失败',
  closeRelease: '关闭'
});

function createUpdateSubject(appUpdates) {
  const documentListeners = new Map();
  const document = {
    addEventListener: (type, listener) => documentListeners.set(type, listener)
  };
  const elements = Object.fromEntries([
    'version', 'checkUpdate', 'updateStatus', 'updateStatusText', 'updateProgress',
    'updateProgressValue', 'releaseModal', 'releaseTitle', 'releaseVersion',
    'releaseNotes', 'releaseClose'
  ].map((name) => [name, createElement()]));
  elements.releaseModal.hidden = true;

  const window = { appUpdates };
  loadBrowserScript('update-controller.js', {
    window,
    document,
    console: { info: () => {}, warn: () => {}, error: () => {} }
  });
  const controller = window.createUpdateController({
    elements,
    getText: () => UPDATE_TEXT
  });
  return { controller, documentListeners, elements };
}

test('中英文词典拥有一致的顶层键，避免切换语言后出现空文案', () => {
  const window = loadBrowserScript('translations.js');
  const translations = window.VibeCalendarTranslations;

  assert.deepEqual(
    Object.keys(translations['zh-CN']).sort(),
    Object.keys(translations.en).sort()
  );
  assert.deepEqual(
    Object.keys(translations['zh-CN'].festivals).sort(),
    Object.keys(translations.en.festivals).sort()
  );
  assert.equal(translations.en.dayOffMarker, 'Rest');
  Object.values(translations.en.festivals).forEach((name) => {
    assert.doesNotMatch(name, /\p{Script=Han}/u);
  });
});

test('更新界面控制器显示真实版本、公告并反馈手动检查结果', async () => {
  const { controller, documentListeners, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getCurrentRelease: async () => ({ version: '2.3.4', title: 'VibeCalendar v2.3.4', notes: '**更快**' }),
    checkForUpdates: async () => ({
      status: 'available', latestVersion: '2.4.0', downloadStarted: true
    })
  });

  await controller.initialize();
  assert.equal(elements.version.textContent, 'v2.3.4');

  await elements.version.dispatch('click');
  assert.equal(elements.releaseModal.hidden, false);
  assert.equal(elements.releaseVersion.textContent, 'VibeCalendar v2.3.4');
  assert.equal(elements.releaseNotes.textContent, '更快');

  await elements.checkUpdate.dispatch('click');
  assert.equal(elements.updateStatusText.textContent, '发现 v2.4.0');
  assert.equal(elements.updateProgress.hidden, false);
  assert.equal(elements.updateProgress.classList.contains('is-indeterminate'), true);
  assert.equal(elements.updateStatus.getAttribute('aria-busy'), 'true');
  assert.equal(elements.checkUpdate.disabled, true);
  assert.equal(elements.checkUpdate.getAttribute('aria-label'), '正在下载');

  documentListeners.get('keydown')({ key: 'Escape' });
  assert.equal(elements.releaseModal.hidden, true);
});

test('静态网页预览会隐藏 Electron 专属的更新入口', async () => {
  const { controller, elements } = createUpdateSubject(undefined);

  await controller.initialize();
  assert.equal(elements.version.hidden, true);
  assert.equal(elements.checkUpdate.hidden, true);
});

test('开发版发现新版时给出结论并恢复检查按钮', async () => {
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getCurrentRelease: async () => ({ version: '2.3.4', notes: '说明' }),
    checkForUpdates: async () => ({
      status: 'available',
      latestVersion: '2.4.0',
      downloadStarted: false
    })
  });

  await controller.initialize();
  await elements.checkUpdate.dispatch('click');
  assert.equal(elements.updateStatusText.textContent, '发现新版本 v2.4.0');
  assert.equal(elements.updateProgress.hidden, true);
  assert.equal(elements.checkUpdate.disabled, false);
});

test('公告和检查更新失败时显示可恢复错误状态', async () => {
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getCurrentRelease: async () => { throw new Error('missing notes'); },
    checkForUpdates: async () => ({ status: 'error' })
  });

  await controller.initialize();
  await elements.version.dispatch('click');
  assert.equal(elements.releaseNotes.textContent, '公告失败');

  await elements.checkUpdate.dispatch('click');
  assert.equal(elements.updateStatusText.textContent, '失败');
  assert.equal(elements.updateStatus.classList.contains('is-error'), true);
  assert.equal(elements.checkUpdate.disabled, false);
});

test('手动检查立即显示进度，异常返回也不会表现为无反应', async () => {
  let finishCheck;
  const pendingCheck = new Promise((resolve) => {
    finishCheck = resolve;
  });
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getCurrentRelease: async () => ({ version: '2.3.4', notes: '说明' }),
    checkForUpdates: () => pendingCheck
  });

  await controller.initialize();
  const checkAction = elements.checkUpdate.dispatch('click');
  await Promise.resolve();
  assert.equal(elements.updateStatusText.textContent, '正在检查');
  assert.equal(elements.updateStatus.hidden, false);
  assert.equal(elements.checkUpdate.disabled, true);

  finishCheck({ status: 'unexpected' });
  await checkAction;
  assert.equal(elements.updateStatusText.textContent, '失败');
  assert.equal(elements.updateStatus.classList.contains('is-error'), true);
  assert.equal(elements.checkUpdate.disabled, false);
});

test('更新下载事件驱动环形进度、完成和失败状态', async () => {
  let updateListener;
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getCurrentRelease: async () => ({ version: '2.3.4', notes: '说明' }),
    checkForUpdates: async () => ({ status: 'up-to-date' }),
    installUpdate: async () => ({ status: 'installing' }),
    onUpdateStatus: (listener) => {
      updateListener = listener;
      return () => {};
    }
  });

  await controller.initialize();
  updateListener({ phase: 'available', version: '2.4.0' });
  assert.equal(elements.checkUpdate.disabled, true);
  assert.equal(elements.updateProgress.classList.contains('is-indeterminate'), true);

  updateListener({ phase: 'downloading', percent: 42.4 });
  assert.equal(elements.updateStatusText.textContent, '正在下载 v2.4.0：42%');
  assert.equal(elements.updateProgressValue.textContent, '42%');
  assert.equal(elements.updateProgress.style.getPropertyValue('--progress'), 42);
  assert.equal(elements.updateProgress.getAttribute('aria-valuenow'), 42);

  updateListener({ phase: 'downloaded', version: '2.4.0' });
  assert.equal(elements.updateStatusText.textContent, 'v2.4.0 下载完成');
  assert.equal(elements.updateProgressValue.textContent, '100%');
  assert.equal(elements.checkUpdate.disabled, false);
  assert.equal(elements.checkUpdate.getAttribute('aria-label'), '更新 V2.4.0 版本');
  assert.equal(elements.updateStatus.getAttribute('aria-busy'), 'false');

  await elements.checkUpdate.dispatch('click');
  assert.equal(elements.updateStatusText.textContent, '正在安装更新');
  assert.equal(elements.checkUpdate.disabled, true);

  updateListener({ phase: 'error' });
  assert.equal(elements.updateStatusText.textContent, '失败');
  assert.equal(elements.updateProgress.hidden, true);
  assert.equal(elements.updateStatus.classList.contains('is-error'), true);
});
