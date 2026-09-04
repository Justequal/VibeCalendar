const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadMainProcess({ livePreview = false, singleInstanceLock = true } = {}) {
  const ipcHandlers = new Map();
  const appListeners = new Map();
  const updateCalls = [];
  const installCalls = [];
  let releaseCalls = 0;
  let stateCalls = 0;
  let quitCalls = 0;
  let watcher;

  class FakeBrowserWindow {
    static instances = [];

    constructor(options) {
      this.options = options;
      this.destroyed = false;
      this.webContentsListeners = new Map();
      this.windowListeners = new Map();
      this.webContents = {
        setWindowOpenHandler: (handler) => { this.openHandler = handler; },
        on: (event, handler) => this.webContentsListeners.set(event, handler),
        reloadIgnoringCache: () => { this.reloadCount = (this.reloadCount || 0) + 1; }
      };
      FakeBrowserWindow.instances.push(this);
    }

    loadFile(filename) { this.loadedFile = filename; }
    isDestroyed() { return this.destroyed; }
    focus() { this.focusCount = (this.focusCount || 0) + 1; }
    show() { this.showCount = (this.showCount || 0) + 1; }
    isMinimized() { return Boolean(this.minimized); }
    restore() {
      this.minimized = false;
      this.restoreCount = (this.restoreCount || 0) + 1;
    }
    setAlwaysOnTop() {}
    once(event, handler) { this.windowListeners.set(event, handler); }
  }

  FakeBrowserWindow.getAllWindows = () => FakeBrowserWindow.instances;
  FakeBrowserWindow.fromWebContents = () => FakeBrowserWindow.instances[0];

  const electron = {
    app: {
      disableHardwareAcceleration: () => {},
      getVersion: () => '1.1.1',
      on: (event, handler) => appListeners.set(event, handler),
      quit: () => { quitCalls += 1; },
      requestSingleInstanceLock: () => singleInstanceLock,
      whenReady: () => Promise.resolve()
    },
    BrowserWindow: FakeBrowserWindow,
    ipcMain: {
      handle: (channel, handler) => ipcHandlers.set(channel, handler)
    }
  };
  const updater = {
    checkForUpdates: async (...args) => {
      updateCalls.push(args);
      return { status: 'up-to-date', currentVersion: '1.1.1' };
    },
    getCurrentRelease: async () => {
      releaseCalls += 1;
      return { version: '1.1.1' };
    },
    getUpdateState: () => {
      stateCalls += 1;
      return { phase: 'idle' };
    },
    installUpdate: async () => {
      installCalls.push(true);
      return { status: 'installing' };
    }
  };
  const fs = {
    watch: (directory, options, callback) => {
      watcher = {
        directory,
        options,
        callback,
        closed: false,
        on: () => {},
        close() { this.closed = true; }
      };
      return watcher;
    }
  };

  const mainPath = path.resolve(__dirname, '../src/main/main.js');
  delete require.cache[mainPath];
  const originalLoad = Module._load;
  Module._load = function mockMainDependencies(request, parent, isMain) {
    if (request === 'electron') return electron;
    if (request === 'fs') return fs;
    if (request === './updater' && parent?.filename === mainPath) return updater;
    return originalLoad.call(this, request, parent, isMain);
  };

  if (livePreview) process.argv.push('--live-preview');
  try {
    require(mainPath);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    Module._load = originalLoad;
    if (livePreview) {
      const argumentIndex = process.argv.lastIndexOf('--live-preview');
      if (argumentIndex >= 0) process.argv.splice(argumentIndex, 1);
    }
  }

  return {
    appListeners,
    ipcHandlers,
    updateCalls,
    installCalls,
    getReleaseCalls: () => releaseCalls,
    getStateCalls: () => stateCalls,
    getQuitCalls: () => quitCalls,
    watcher,
    window: FakeBrowserWindow.instances[0]
  };
}

test('主进程以安全配置创建窗口，并在启动后自动检查更新', async () => {
  const subject = await loadMainProcess();
  const window = subject.window;

  assert.ok(window);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.match(window.options.webPreferences.preload, /preload\.js$/);
  assert.match(window.loadedFile, /renderer[\\/]index\.html$/);
  assert.deepEqual(window.openHandler(), { action: 'deny' });
  assert.equal(subject.updateCalls.length, 1);
  assert.equal(subject.updateCalls[0][0], window);
  assert.equal(subject.updateCalls[0][1], undefined);
});

test('重复启动只唤醒已有窗口，未取得单实例锁时不创建窗口', async () => {
  const subject = await loadMainProcess();
  subject.window.minimized = true;

  subject.appListeners.get('second-instance')();
  assert.equal(subject.window.restoreCount, 1);
  assert.equal(subject.window.showCount, 1);
  assert.equal(subject.window.focusCount, 1);

  const duplicate = await loadMainProcess({ singleInstanceLock: false });
  assert.equal(duplicate.window, undefined);
  assert.equal(duplicate.getQuitCalls(), 1);
  assert.equal(duplicate.updateCalls.length, 0);
});

test('实时预览只监听前端资源，并合并连续保存后刷新窗口', async () => {
  const subject = await loadMainProcess({ livePreview: true });

  assert.ok(subject.watcher);
  assert.match(subject.watcher.directory, /src[\\/]renderer$/);
  assert.equal(subject.watcher.options.recursive, true);

  subject.watcher.callback('change', 'renderer.js');
  subject.watcher.callback('change', 'style.css');
  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.equal(subject.window.reloadCount, 1);

  subject.watcher.callback('change', 'notes.txt');
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(subject.window.reloadCount, 1);

  subject.window.windowListeners.get('closed')();
  assert.equal(subject.watcher.closed, true);
});

test('更新 IPC 只接受本地日历页面，并正确区分公告与手动检查', async () => {
  const subject = await loadMainProcess();
  const rendererPath = path.resolve(__dirname, '../src/renderer/index.html');
  const trustedEvent = {
    senderFrame: { url: pathToFileURL(rendererPath).href },
    sender: {}
  };

  assert.equal(subject.ipcHandlers.size, 5);
  assert.equal(
    subject.ipcHandlers.get('app:get-version')(trustedEvent),
    '1.1.1'
  );
  assert.deepEqual(
    await subject.ipcHandlers.get('updates:get-current-release')(trustedEvent),
    { version: '1.1.1' }
  );
  assert.equal(subject.getReleaseCalls(), 1);
  assert.deepEqual(
    subject.ipcHandlers.get('updates:get-state')(trustedEvent),
    { phase: 'idle' }
  );
  assert.equal(subject.getStateCalls(), 1);

  const manualResult = await subject.ipcHandlers.get('updates:check')(trustedEvent);
  assert.equal(manualResult.status, 'up-to-date');
  assert.equal(subject.updateCalls.length, 2);
  assert.equal(subject.updateCalls[1][0], subject.window);
  assert.deepEqual(subject.updateCalls[1][1], { manual: true });

  assert.deepEqual(
    await subject.ipcHandlers.get('updates:install')(trustedEvent),
    { status: 'installing' }
  );
  assert.equal(subject.installCalls.length, 1);

  const untrustedEvent = {
    senderFrame: { url: 'https://example.com/' },
    sender: {}
  };
  assert.throws(
    () => subject.ipcHandlers.get('app:get-version')(untrustedEvent),
    /非应用页面/
  );
});
