/**
 * Electron 渲染层冒烟测试。
 *
 * 使用真实 BrowserWindow 与项目 Preload，在隐藏窗口中验证关键交互。更新服务由
 * 本地 IPC 固定响应替代，保证测试不会下载更新，也不依赖 GitHub 网络状态。
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const packageMetadata = require('../package.json');

app.disableHardwareAcceleration();

function invoke(window, source) {
  return window.webContents.executeJavaScript(`(async () => { ${source} })()`, true);
}

async function run() {
  await app.whenReady();

  const currentVersion = packageMetadata.version;
  ipcMain.handle('app:get-version', () => currentVersion);
  ipcMain.handle('updates:get-current-release', () => ({
    version: currentVersion,
    title: `VibeCalendar v${currentVersion}`,
    notes: '**修复**\n\n- 手动检查更新会立即显示结果'
  }));
  ipcMain.handle('updates:get-state', () => ({ phase: 'idle' }));
  ipcMain.handle('updates:check', (event) => {
    setTimeout(() => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('updates:status', {
          phase: 'downloading',
          version: '9.9.9',
          percent: 42.4
        });
        setTimeout(() => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('updates:status', {
              phase: 'downloaded',
              version: '9.9.9',
              percent: 100
            });
          }
        }, 70);
      }
    }, 5);
    return {
      status: 'available',
      currentVersion,
      latestVersion: '9.9.9',
      downloadStarted: true
    };
  });
  ipcMain.handle('updates:install', () => ({ status: 'installing', version: '9.9.9' }));

  const rendererEntry = path.resolve(__dirname, '../src/renderer/index.html');
  const window = new BrowserWindow({
    width: 340,
    height: 500,
    show: false,
    webPreferences: {
      // 不带 persist: 前缀的 partition 只存在于内存，不读取或污染用户偏好。
      partition: `vibe-calendar-smoke-${process.pid}-${Date.now()}`,
      preload: path.resolve(__dirname, '../src/main/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  try {
    await window.loadFile(rendererEntry);

    const initial = await invoke(window, `
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        language: document.documentElement.lang,
        title: document.title,
        weekday: document.querySelector('.weekdays > div')?.textContent,
        cellCount: document.querySelectorAll('.day').length,
        version: document.getElementById('version-btn').textContent,
        versionHidden: document.getElementById('version-btn').hidden,
        updateHidden: document.getElementById('check-update-btn').hidden,
        clock: document.getElementById('clock').textContent,
        todayCount: document.querySelectorAll('.day[aria-current="date"]').length,
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth
      };
    `);
    assert.equal(initial.language, 'zh-CN');
    assert.equal(initial.title, 'VibeCalendar');
    assert.equal(initial.weekday, '一');
    assert.equal(initial.cellCount, 42);
    assert.equal(initial.version, `v${currentVersion}`);
    assert.equal(initial.versionHidden, false);
    assert.equal(initial.updateHidden, false);
    assert.match(initial.clock, /^\d{2}:\d{2}:\d{2}$/);
    assert.equal(initial.todayCount, 1);
    assert.equal(initial.pageFits, true);

    const navigation = await invoke(window, `
      const originalTitle = document.getElementById('month-year').textContent;
      document.getElementById('next-month').click();
      const nextTitle = document.getElementById('month-year').textContent;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      const arrowReturnedTitle = document.getElementById('month-year').textContent;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
      const shortcutReturnedTitle = document.getElementById('month-year').textContent;
      document.getElementById('next-month').click();
      document.getElementById('go-today-btn').click();
      return {
        originalTitle,
        nextTitle,
        arrowReturnedTitle,
        shortcutReturnedTitle,
        returnedTitle: document.getElementById('month-year').textContent
      };
    `);
    assert.notEqual(navigation.nextTitle, navigation.originalTitle);
    assert.equal(navigation.arrowReturnedTitle, navigation.originalTitle);
    assert.equal(navigation.shortcutReturnedTitle, navigation.originalTitle);
    assert.equal(navigation.returnedTitle, navigation.originalTitle);

    const english = await invoke(window, `
      document.getElementById('language-toggle-btn').click();
      return {
        language: document.documentElement.lang,
        weekday: document.querySelector('.weekdays > div')?.textContent,
        today: document.getElementById('go-today-btn').textContent,
        checkUpdate: document.getElementById('check-update-btn').textContent
      };
    `);
    assert.deepEqual(english, {
      language: 'en',
      weekday: 'Mon',
      today: 'Go to Today',
      checkUpdate: 'Check for Updates'
    });

    const sundayFirst = await invoke(window, `
      document.getElementById('toggle-week-btn').click();
      return document.querySelector('.weekdays > div')?.textContent;
    `);
    assert.equal(sundayFirst, 'Sun');

    await window.loadFile(rendererEntry);
    const persistedPreferences = await invoke(window, `
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        language: document.documentElement.lang,
        weekday: document.querySelector('.weekdays > div')?.textContent
      };
    `);
    assert.deepEqual(persistedPreferences, { language: 'en', weekday: 'Sun' });

    const palette = await invoke(window, `
      function getPalette(className) {
        const sample = document.createElement('div');
        sample.className = className;
        document.body.appendChild(sample);
        const style = getComputedStyle(sample);
        const result = {
          background: style.backgroundImage,
          border: style.borderTopColor
        };
        sample.remove();
        return result;
      }
      return {
        weekend: getPalette('day is-weekend'),
        dayOff: getPalette('day is-day-off'),
        festival: getPalette('day is-festival'),
        makeup: getPalette('day is-makeup-workday')
      };
    `);
    assert.deepEqual(palette.weekend, palette.dayOff);
    assert.notDeepEqual(palette.festival, palette.dayOff);
    assert.notDeepEqual(palette.makeup, palette.dayOff);

    const release = await invoke(window, `
      document.getElementById('version-btn').click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const modal = document.getElementById('release-modal');
      const notes = document.getElementById('release-notes');
      return {
        open: !modal.hidden,
        title: document.getElementById('release-version').textContent,
        notes: notes.textContent,
        notesFit: notes.scrollWidth <= notes.clientWidth,
        focused: document.activeElement?.id
      };
    `);
    assert.equal(release.open, true);
    assert.equal(release.title, `VibeCalendar v${currentVersion}`);
    assert.doesNotMatch(release.notes, /\*\*/);
    assert.match(release.notes, /手动检查更新会立即显示结果/);
    assert.doesNotMatch(release.notes, /compare/);
    assert.equal(release.notesFit, true);
    assert.equal(release.focused, 'release-close-btn');

    const wheelWhileModalOpen = await invoke(window, `
      const before = document.querySelector('.day')?.dataset.date;
      document.getElementById('app-container').dispatchEvent(new WheelEvent('wheel', {
        deltaY: 600,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles: true
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { before, after: document.querySelector('.day')?.dataset.date };
    `);
    assert.equal(wheelWhileModalOpen.after, wheelWhileModalOpen.before);

    const updateAndClose = await invoke(window, `
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.getElementById('check-update-btn').click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        modalHidden: document.getElementById('release-modal').hidden,
        focused: document.activeElement?.id,
        progress: document.getElementById('check-update-btn').style.getPropertyValue('--update-progress'),
        progressNow: document.getElementById('check-update-btn').getAttribute('aria-valuenow'),
        progressText: document.getElementById('check-update-btn').getAttribute('aria-valuetext'),
        checkDisabled: document.getElementById('check-update-btn').disabled,
        checkText: document.getElementById('check-update-btn').textContent
      };
    `);
    assert.equal(updateAndClose.modalHidden, true);
    assert.equal(updateAndClose.focused, 'version-btn');
    assert.equal(updateAndClose.progress, '42');
    assert.equal(updateAndClose.progressNow, '42');
    assert.equal(updateAndClose.progressText, 'Downloading 42%');
    assert.equal(updateAndClose.checkDisabled, true);
    assert.equal(updateAndClose.checkText, 'Downloading 42%');

    const downloaded = await invoke(window, `
      await new Promise((resolve) => setTimeout(resolve, 100));
      const button = document.getElementById('check-update-btn');
      const before = { text: button.textContent, disabled: button.disabled };
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { before, after: button.textContent };
    `);
    assert.deepEqual(downloaded.before, { text: 'Quick restart to update V9.9.9', disabled: false });
    assert.equal(downloaded.after, 'Restarting to update…');

    const fastWheel = await invoke(window, `
      const before = document.querySelector('.day')?.dataset.date;
      document.getElementById('app-container').dispatchEvent(new WheelEvent('wheel', {
        deltaY: 350,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles: true
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const after = document.querySelector('.day')?.dataset.date;
      const days = Math.round((new Date(after + 'T12:00:00') - new Date(before + 'T12:00:00')) / 86400000);
      return { before, after, days };
    `);
    assert.equal(fastWheel.days, 21);

    console.log('UI smoke passed: calendar, navigation, i18n, week start, wheel, version, release notes, update download progress.');
  } finally {
    window.destroy();
    ipcMain.removeHandler('app:get-version');
    ipcMain.removeHandler('updates:get-current-release');
    ipcMain.removeHandler('updates:check');
  }
}

run()
  .then(() => {
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
