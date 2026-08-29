const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const path = require('node:path');

function loadUpdater({ isPackaged = true, dialogResponse = 0 } = {}) {
  const autoUpdater = new EventEmitter();
  let checkCount = 0;
  let quitArguments;
  const dialogs = [];

  autoUpdater.checkForUpdates = async () => {
    checkCount += 1;
    return null;
  };
  autoUpdater.quitAndInstall = (...args) => {
    quitArguments = args;
  };

  const electron = {
    app: { isPackaged },
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
  subject.module.checkForUpdates(parentWindow);

  assert.equal(subject.getCheckCount(), 1);
  assert.equal(subject.autoUpdater.autoDownload, true);
  assert.equal(subject.autoUpdater.autoInstallOnAppQuit, true);
  assert.equal(subject.autoUpdater.allowPrerelease, false);

  subject.autoUpdater.emit('update-available', { version: '1.1.0' });
  assert.equal(subject.dialogs.length, 0);

  subject.autoUpdater.emit('update-downloaded', { version: '1.1.0' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(subject.dialogs.length, 1);
  assert.match(subject.dialogs[0].message, /v1\.1\.0/);
  assert.deepEqual(subject.getQuitArguments(), [false, true]);
});

test('开发版不访问更新服务', () => {
  const subject = loadUpdater({ isPackaged: false });
  subject.module.checkForUpdates();
  assert.equal(subject.getCheckCount(), 0);
});
