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

  return {
    textContent: '',
    title: '',
    hidden: false,
    disabled: false,
    addEventListener: (type, listener) => listeners.set(type, listener),
    dispatch: (type, event = {}) => listeners.get(type)?.(event),
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name),
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
  updateAvailable: '发现 v{version}',
  upToDate: '已是最新',
  updateCheckError: '失败',
  updateUnavailable: '不可用',
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
    'version', 'checkUpdate', 'updateStatus', 'releaseModal', 'releaseTitle',
    'releaseVersion', 'releaseNotes', 'releaseClose'
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
    getLatestRelease: async () => ({ version: '2.4.0', title: 'Spring v2.4.0', notes: '**更快**' }),
    checkForUpdates: async () => ({ status: 'available', latestVersion: '2.4.0' })
  });

  await controller.initialize();
  assert.equal(elements.version.textContent, 'v2.3.4');

  await elements.version.dispatch('click');
  assert.equal(elements.releaseModal.hidden, false);
  assert.equal(elements.releaseVersion.textContent, 'Spring v2.4.0');
  assert.equal(elements.releaseNotes.textContent, '更快');

  await elements.checkUpdate.dispatch('click');
  assert.equal(elements.updateStatus.textContent, '发现 v2.4.0');
  assert.equal(elements.checkUpdate.disabled, false);

  documentListeners.get('keydown')({ key: 'Escape' });
  assert.equal(elements.releaseModal.hidden, true);
});

test('静态网页预览会隐藏 Electron 专属的更新入口', async () => {
  const { controller, elements } = createUpdateSubject(undefined);

  await controller.initialize();
  assert.equal(elements.version.hidden, true);
  assert.equal(elements.checkUpdate.hidden, true);
});

test('公告和检查更新失败时显示可恢复错误状态', async () => {
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getLatestRelease: async () => { throw new Error('offline'); },
    checkForUpdates: async () => ({ status: 'error' })
  });

  await controller.initialize();
  await elements.version.dispatch('click');
  assert.equal(elements.releaseNotes.textContent, '公告失败');

  await elements.checkUpdate.dispatch('click');
  assert.equal(elements.updateStatus.textContent, '失败');
  assert.equal(elements.updateStatus.classList.contains('is-error'), true);
  assert.equal(elements.checkUpdate.disabled, false);
});
