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
  ipcMain.handle('updates:get-latest-release', () => ({
    version: currentVersion,
    title: `Vibe Calendar v${currentVersion}`,
    notes: `**Full Changelog**: https://github.com/Justequal/VibeCalendar/compare/v1.1.1...v${currentVersion}`
  }));
  ipcMain.handle('updates:check', () => ({
    status: 'up-to-date',
    currentVersion,
    latestVersion: currentVersion
  }));

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
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth
      };
    `);
    assert.equal(initial.language, 'zh-CN');
    assert.equal(initial.title, '氛围日历');
    assert.equal(initial.weekday, '一');
    assert.equal(initial.cellCount, 42);
    assert.equal(initial.version, `v${currentVersion}`);
    assert.equal(initial.versionHidden, false);
    assert.equal(initial.updateHidden, false);
    assert.match(initial.clock, /^\d{2}:\d{2}:\d{2}$/);
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
    assert.equal(release.title, `Vibe Calendar v${currentVersion}`);
    assert.doesNotMatch(release.notes, /\*\*/);
    assert.match(release.notes, /Full Changelog/);
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
        status: document.getElementById('update-status').textContent,
        checkDisabled: document.getElementById('check-update-btn').disabled
      };
    `);
    assert.equal(updateAndClose.modalHidden, true);
    assert.equal(updateAndClose.focused, 'version-btn');
    assert.equal(updateAndClose.status, 'You are using the latest version');
    assert.equal(updateAndClose.checkDisabled, false);

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

    console.log('UI smoke passed: calendar, navigation, i18n, week start, wheel, version, release notes, manual update.');
  } finally {
    window.destroy();
    ipcMain.removeHandler('app:get-version');
    ipcMain.removeHandler('updates:get-latest-release');
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
