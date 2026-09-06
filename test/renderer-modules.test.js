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
    dataset: {},
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
  updateNow: '快速重启更新 V{version}',
  updating: '正在快速重启',
  releaseTitle: '更新公告',
  releaseLoading: '加载中',
  releaseNoNotes: '无说明',
  releaseLoadError: '公告失败',
  closeRelease: '关闭'
});

test('启动、后台检查和下载期间隐藏入口，点击不会发起手动检查', async () => {
  let notify;
  let checks = 0;
  let installs = 0;
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getUpdateState: async () => ({ phase: 'idle' }),
    checkForUpdates: async () => { checks += 1; },
    installUpdate: async () => { installs += 1; },
    onUpdateStatus: listener => { notify = listener; }
  });
  await controller.initialize();
  for (const phase of ['idle', 'available', 'downloading', 'error']) {
    if (phase !== 'idle') notify({ phase, version: '2.4.0', percent: 42 });
    controller.syncLanguage();
    assert.equal(elements.installUpdate.hidden, true, phase);
    assert.equal(elements.installUpdate.disabled, true, phase);
    await elements.installUpdate.dispatch('click');
  }
  assert.equal(checks, 0);
  assert.equal(installs, 0);
});

test('后台下载完成后才显示按钮，过期下载事件不隐藏安装入口', async () => {
  let notify;
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    onUpdateStatus: listener => { notify = listener; },
    installUpdate: async () => ({ status: 'installing' })
  });
  await controller.initialize();
  notify({ phase: 'downloaded', version: '2.4.0' });
  for (const phase of ['available', 'downloading']) notify({ phase, version: '2.4.0', percent: 12 });
  assert.equal(elements.installUpdate.hidden, false);
  assert.equal(elements.installUpdate.textContent, '快速重启更新 V2.4.0');
  assert.equal(elements.installUpdate.disabled, false);
  await elements.installUpdate.dispatch('click');
  assert.equal(elements.installUpdate.hidden, false);
  assert.equal(elements.installUpdate.disabled, true);
  assert.equal(elements.installUpdate.getAttribute('aria-busy'), 'true');
});

test('迟到的启动快照不能隐藏已下载完成的按钮', async () => {
  const snapshot = deferred();
  let notify;
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getUpdateState: () => snapshot.promise,
    onUpdateStatus: listener => { notify = listener; }
  });
  const initialization = controller.initialize();
  notify({ phase: 'downloaded', version: '2.4.0' });
  snapshot.resolve({ phase: 'downloading', version: '2.4.0', percent: 20 });
  await initialization;
  assert.equal(elements.installUpdate.hidden, false);
  assert.equal(elements.installUpdate.dataset.updatePhase, 'downloaded');
});

test('安装IPC拒绝时恢复已下载按钮以便重试', async () => {
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getUpdateState: async () => ({ phase: 'downloaded', version: '2.4.0' }),
    installUpdate: async () => { throw new Error('IPC disconnected'); }
  });
  await controller.initialize();
  await elements.installUpdate.dispatch('click');
  assert.equal(elements.installUpdate.hidden, false);
  assert.equal(elements.installUpdate.disabled, false);
  assert.equal(elements.installUpdate.dataset.updatePhase, 'downloaded');
});

test('版本公告仍可打开和关闭，初始化不会重复订阅', async () => {
  let subscriptions = 0;
  const { controller, elements, documentListeners } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getCurrentRelease: async () => ({ version: '2.3.4', title: 'VibeCalendar v2.3.4', notes: '**更快**' }),
    onUpdateStatus: () => { subscriptions += 1; }
  });
  await controller.initialize();
  await controller.initialize();
  assert.equal(subscriptions, 1);
  await elements.version.dispatch('click');
  assert.equal(elements.releaseNotes.textContent, '更快');
  assert.equal(elements.releaseModal.hidden, false);
  documentListeners.get('keydown')({ key: 'Escape' });
  assert.equal(elements.releaseModal.hidden, true);
});

function createUpdateSubject(appUpdates) {
  const documentListeners = new Map();
  const document = {
    activeElement: null,
    addEventListener: (type, listener) => documentListeners.set(type, listener)
  };
  const elements = Object.fromEntries([
    'version', 'installUpdate', 'releaseModal', 'releaseTitle', 'releaseVersion',
    'releaseNotes', 'releaseClose'
  ].map((name) => [name, createElement()]));
  elements.releaseModal.hidden = true;
  Object.values(elements).forEach((element) => {
    element.focus = () => { document.activeElement = element; };
  });

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
  return { controller, document, documentListeners, elements };
}

// 可控的异步响应：由测试决定何时成功或失败，稳定复现网络与 IPC 的乱序。
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('版本读取失败也能恢复安装状态，安装错误事件恢复重试入口', async () => {
  let notify;
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => { throw new Error('version failed'); },
    getUpdateState: async () => ({ phase: 'installing', version: '2.4.0' }),
    onUpdateStatus: (listener) => { notify = listener; }
  });
  await controller.initialize();
  assert.equal(elements.installUpdate.textContent, '正在快速重启');
  notify({ phase: 'downloaded', version: '2.4.0' });
  assert.equal(elements.installUpdate.textContent, '快速重启更新 V2.4.0');
  assert.equal(elements.installUpdate.disabled, false);
});

test('安装恢复事件优先于迟到的 installing 返回，忙碌阶段不重复提交', async () => {
  const pending = deferred();
  let notify;
  let installCount = 0;
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getUpdateState: async () => ({ phase: 'downloaded', version: '2.4.0' }),
    installUpdate: () => { installCount += 1; return pending.promise; },
    onUpdateStatus: (listener) => { notify = listener; }
  });
  await controller.initialize();
  const action = elements.installUpdate.dispatch('click');
  await elements.installUpdate.dispatch('click');
  assert.equal(installCount, 1);
  notify({ phase: 'downloaded', version: '2.4.0' });
  pending.resolve({ status: 'installing' });
  await action;
  assert.equal(elements.installUpdate.textContent, '快速重启更新 V2.4.0');
  assert.equal(elements.installUpdate.disabled, false);
});

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

test('静态网页预览会隐藏 Electron 专属的更新入口', async () => {
  const { controller, elements } = createUpdateSubject(undefined);

  await controller.initialize();
  assert.equal(elements.version.hidden, true);
  assert.equal(elements.installUpdate.hidden, true);
});

test('版本说明弹层将 Tab 焦点限制在关闭按钮和公告正文中', async () => {
  const { controller, document, documentListeners, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getUpdateState: async () => ({ phase: 'idle' }),
    getCurrentRelease: async () => ({ version: '2.3.4', notes: '说明' }),
    onUpdateStatus: () => () => {}
  });
  await controller.initialize();
  await elements.version.dispatch('click');

  let prevented = 0;
  documentListeners.get('keydown')({
    key: 'Tab', shiftKey: false, preventDefault: () => { prevented += 1; }
  });
  assert.equal(document.activeElement, elements.releaseNotes);
  assert.equal(prevented, 1);

  documentListeners.get('keydown')({
    key: 'Tab', shiftKey: true, preventDefault: () => { prevented += 1; }
  });
  assert.equal(document.activeElement, elements.releaseClose);
  assert.equal(prevented, 2);
});

test('窗口加载后恢复主进程已经下载完成的更新状态', async () => {
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getUpdateState: async () => ({ phase: 'downloaded', version: '2.4.0', percent: 100 }),
    getCurrentRelease: async () => ({ version: '2.3.4', notes: '说明' }),
    checkForUpdates: async () => ({ status: 'up-to-date' }),
    installUpdate: async () => ({ status: 'installing' }),
    onUpdateStatus: () => () => {}
  });

  await controller.initialize();
  assert.equal(elements.installUpdate.textContent, '快速重启更新 V2.4.0');
  assert.equal(elements.installUpdate.disabled, false);
  assert.equal(elements.installUpdate.classList.contains('is-ready'), true);
});

test('快速重启未被主进程接管时恢复可点击更新按钮', async () => {
  let updateListener;
  const { controller, elements } = createUpdateSubject({
    getVersion: async () => '2.3.4',
    getUpdateState: async () => ({ phase: 'downloaded', version: '2.4.0', percent: 100 }),
    getCurrentRelease: async () => ({ version: '2.3.4', notes: '说明' }),
    installUpdate: async () => ({ status: 'error' }),
    onUpdateStatus: (listener) => {
      updateListener = listener;
      return () => {};
    }
  });

  await controller.initialize();
  await elements.installUpdate.dispatch('click');
  assert.equal(elements.installUpdate.textContent, '快速重启更新 V2.4.0');
  assert.equal(elements.installUpdate.disabled, false);
  assert.equal(typeof updateListener, 'function');
});
