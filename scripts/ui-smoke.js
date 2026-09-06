/**
 * Electron 渲染层冒烟测试。
 *
 * 使用真实 BrowserWindow 与项目 Preload，在隐藏窗口中验证关键交互。更新服务由
 * 本地 IPC 固定响应替代，保证测试不会下载更新，也不依赖 GitHub 网络状态。
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const appRoot = process.env.VIBE_TEST_APP_ROOT || path.resolve(__dirname, '..');
const packageMetadata = require(path.join(appRoot, 'package.json'));

app.disableHardwareAcceleration();
if (process.env.VIBE_TEST_SCALE) app.commandLine.appendSwitch('force-device-scale-factor', process.env.VIBE_TEST_SCALE);
const testProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-calendar-ui-'));
app.setPath('userData', testProfile);
app.setPath('sessionData', testProfile);

function invoke(window, source) {
  return window.webContents.executeJavaScript(`(async () => { ${source} })()`, true);
}

async function waitFor(window, expression) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await invoke(window, `return (${expression});`)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`等待界面状态超时：${expression}`);
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

  const rendererEntry = path.join(appRoot, 'src/renderer/index.html');
  const window = new BrowserWindow({
    width: 340,
    height: 500,
    frame: false,
    show: false,
    webPreferences: {
      // 不带 persist: 前缀的 partition 只存在于内存，不读取或污染用户偏好。
      partition: `vibe-calendar-smoke-${process.pid}-${Date.now()}`,
      preload: path.join(appRoot, 'src/main/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  // 隔离真实节假日请求，保证离线测试不受提供方响应和网络时序影响。
  window.webContents.session.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => callback({ cancel: true })
  );

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
          && document.querySelector('.footer').getBoundingClientRect().bottom <= innerHeight
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

    await invoke(window, `
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.getElementById('check-update-btn').click();
    `);
    await waitFor(window, `document.getElementById('check-update-btn').dataset.updatePhase === 'downloading'`);
    const updateAndClose = await invoke(window, `
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

    window.webContents.send('updates:status', {
      phase: 'downloaded', version: '9.9.9', percent: 100
    });
    await waitFor(window, `document.getElementById('check-update-btn').dataset.updatePhase === 'downloaded'`);
    const downloaded = await invoke(window, `
      const button = document.getElementById('check-update-btn');
      const before = { text: button.textContent, disabled: button.disabled };
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { before, after: button.textContent };
    `);
    assert.deepEqual(downloaded.before, { text: 'Quick restart to update V9.9.9', disabled: false });
    assert.equal(downloaded.after, 'Restarting to update…');

    // 通过真实 Preload/IPC 发送安装失败后的恢复状态；不启动或替换本机应用。
    window.webContents.send('updates:status', {
      phase: 'downloaded', version: '9.9.9', percent: 100
    });
    const recovered = await invoke(window, `
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const button = document.getElementById('check-update-btn');
      return { text: button.textContent, disabled: button.disabled, busy: button.getAttribute('aria-busy') };
    `);
    assert.deepEqual(recovered, {
      text: 'Quick restart to update V9.9.9', disabled: false, busy: 'false'
    });

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

    const renderMetrics = await invoke(window, `
      await Promise.allSettled([...holidayManager.pendingRequests.values()]);
      const data = Object.freeze({});
      window.holidayManager = {
        getHolidays: () => data,
        fetchHolidays: async () => data
      };
      document.getElementById('go-today-btn').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const grid = document.getElementById('calendar-grid');
      let replacements = 0;
      const observer = new MutationObserver(records => { replacements += records.length; });
      observer.observe(grid, { childList: true });
      for (let index = 0; index < 24; index += 1) {
        document.getElementById(index % 2 ? 'prev-month' : 'next-month').click();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const original = grid.firstElementChild;
      document.getElementById('go-today-btn').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const unchanged = original === grid.firstElementChild;
      observer.disconnect();
      return { replacements, unchanged };
    `);
    assert.deepEqual(renderMetrics, { replacements: 24, unchanged: true });

    const recoveryAndZoom = await invoke(window, `
      const optionsSeen = [];
      const data = holidayManager.getHolidays(2026);
      holidayManager.fetchHolidays = async (_year, options) => { optionsSeen.push(options); return data; };
      window.dispatchEvent(new Event('online'));
      const before = document.querySelector('.day').dataset.date;
      document.getElementById('app-container').dispatchEvent(new WheelEvent('wheel', {
        deltaY: 600, ctrlKey: true, bubbles: true
      }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        retryRequested: optionsSeen.some(options => options?.retryFallback === true),
        zoomKeptDate: before === document.querySelector('.day').dataset.date
      };
    `);
    assert.deepEqual(recoveryAndZoom, { retryRequested: true, zoomKeptDate: true });

    await invoke(window, `
      window.NativeDate = Date;
      window.smokeNow = new NativeDate(2026, 8, 30, 23, 59, 59).getTime();
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [window.smokeNow])); }
        static now() { return window.smokeNow; }
      };
      document.getElementById('go-today-btn').click();
      window.dispatchEvent(new Event('focus'));
      await new Promise(resolve => setTimeout(resolve, 0));
      window.smokeNow = new NativeDate(2026, 9, 1, 0, 0, 1).getTime();
    `);
    await waitFor(window, `document.querySelector('.day[aria-current="date"]')?.dataset.date === '2026-10-01'
      && document.getElementById('clock').textContent === '00:00:01'`);
    const midnight = await invoke(window, `return {
      title: document.getElementById('month-year').textContent,
      todayCount: document.querySelectorAll('.day[aria-current="date"]').length,
      clock: document.getElementById('clock').textContent
    };`);
    assert.deepEqual(midnight, { title: 'September 2026', todayCount: 1, clock: '00:00:01' });

    const returnFromSleep = await invoke(window, `
      window.smokeNow = new NativeDate(2026, 9, 2, 10, 30, 0).getTime();
      window.dispatchEvent(new Event('focus'));
      return {
        today: document.querySelector('.day[aria-current="date"]')?.dataset.date,
        title: document.getElementById('month-year').textContent,
        clock: document.getElementById('clock').textContent
      };
    `);
    assert.deepEqual(returnFromSleep, { today: '2026-10-02', title: 'September 2026', clock: '10:30:00' });

    const dateBounds = await invoke(window, `
      window.smokeNow = CalendarCore.createDate(1, 0, 1).getTime();
      document.getElementById('go-today-btn').click();
      document.getElementById('prev-month').click();
      const minimum = document.getElementById('month-year').textContent;
      document.getElementById('app-container').dispatchEvent(new WheelEvent('wheel', { deltaY: 1e300, bubbles: true }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const maximum = document.getElementById('month-year').textContent;
      const dates = [...document.querySelectorAll('.day[data-date]')].map(cell => cell.dataset.date);
      const count = document.querySelectorAll('.day').length;
      window.smokeNow = new NativeDate(2026, 9, 2, 10, 30, 0).getTime();
      return { minimum, maximum, last: dates.at(-1), count };
    `);
    assert.deepEqual(dateBounds, { minimum: 'January 1', maximum: 'December 9999', last: '9999-12-31', count: 42 });

    const asyncRefresh = await invoke(window, `
      const maps = new Map();
      const pending = new Map();
      const empty = Object.freeze({});
      window.holidayManager = {
        getHolidays: year => maps.get(year) || empty,
        fetchHolidays: year => {
          if (!pending.has(year)) {
            let resolve;
            const promise = new Promise(done => { resolve = done; });
            pending.set(year, { promise, resolve });
          }
          return pending.get(year).promise;
        }
      };
      document.getElementById('go-today-btn').click();
      for (let index = 0; index < 3; index += 1) document.getElementById('next-month').click();
      const before = document.getElementById('month-year').textContent;
      const updated = Object.freeze({ '2027-01-01': Object.freeze({
        name: '元旦', isHoliday: true, holiday: 'newYear', festival: 'newYear'
      }) });
      maps.set(2027, updated);
      pending.get(2027).resolve(updated);
      pending.get(2026).resolve(empty);
      await new Promise(resolve => setTimeout(resolve, 0));
      return {
        before, after: document.getElementById('month-year').textContent,
        updated: document.querySelector('[data-date="2027-01-01"]').classList.contains('is-festival')
      };
    `);
    assert.deepEqual(asyncRefresh, { before: 'January 2027', after: 'January 2027', updated: true });

    // 同一帧先滚动再打开弹层，排队中的滚动也应被抑制。
    const queuedWheel = await invoke(window, `
      const before = document.querySelector('.day').dataset.date;
      document.getElementById('app-container').dispatchEvent(new WheelEvent('wheel', { deltaY: 600, bubbles: true }));
      document.getElementById('version-btn').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      document.getElementById('release-close-btn').click();
      return { before, after: document.querySelector('.day').dataset.date };
    `);
    assert.equal(queuedWheel.before, queuedWheel.after);

    await invoke(window, `
      window.Date = window.NativeDate;
      delete window.NativeDate;
      delete window.smokeNow;
      window.holidayManager = HolidayService.createHolidayManager({ fetchImpl: null, storage: null });
      document.getElementById('language-toggle-btn').click();
      document.getElementById('go-today-btn').click();
      window.dispatchEvent(new Event('focus'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    `);
    if (process.env.VIBE_SMOKE_SCREENSHOT) {
      const screenshot = await window.webContents.capturePage();
      fs.writeFileSync(process.env.VIBE_SMOKE_SCREENSHOT, screenshot.toPNG());
    }

    console.log('UI smoke passed: calendar, navigation, i18n, wheel/modal race, release notes, updates, midnight, resume, async refresh.');
    console.log('Cached navigation: 24 actions, 24 grid replacements; unchanged Today action: 0 replacements.');
  } finally {
    window.destroy();
    ipcMain.removeHandler('app:get-version');
    ipcMain.removeHandler('updates:get-current-release');
    ipcMain.removeHandler('updates:check');
    ipcMain.removeHandler('updates:get-state');
    ipcMain.removeHandler('updates:install');
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
