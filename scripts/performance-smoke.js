/** Reproducible local measurements, not a cross-device performance guarantee. */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('enable-precise-memory-info');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-performance-'));
app.setPath('userData', profile);
app.setPath('sessionData', profile);

async function run() {
  const started = performance.now();
  await app.whenReady();
  const window = new BrowserWindow({ width: 340, height: 500, frame: false, show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  try {
    window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] },
      (_details, callback) => callback({ cancel: true }));
    await window.loadFile(path.resolve(__dirname, '../src/renderer/index.html'));
    const startupMs = performance.now() - started;
    const results = await window.webContents.executeJavaScript(`(async () => {
      await Promise.allSettled([...holidayManager.pendingRequests.values()]);
      const empty = Object.freeze({});
      window.holidayManager = { getHolidays: () => empty, fetchHolidays: async () => empty };
      document.getElementById('go-today-btn').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const beforeHeap = performance.memory.usedJSHeapSize;
      let replacements = 0;
      const observer = new MutationObserver(records => { replacements += records.length; });
      observer.observe(document.getElementById('calendar-grid'), { childList: true });
      const start = performance.now();
      for (let index = 0; index < 1000; index += 1) {
        document.getElementById(index % 2 ? 'prev-month' : 'next-month').click();
        if (index % 50 === 49) await new Promise(resolve => setTimeout(resolve, 0));
      }
      await new Promise(resolve => setTimeout(resolve, 0));
      observer.disconnect();
      return { actions: 1000, replacements, navigationMs: performance.now() - start,
        beforeHeap, afterHeap: performance.memory.usedJSHeapSize };
    })()`);
    app.getAppMetrics();
    console.log('Navigation measurement complete; sampling 30 seconds of idle use.');
    await new Promise(resolve => setTimeout(resolve, 30000));
    const metrics = app.getAppMetrics();
    const report = {
      version: require('../package.json').version, platform: process.platform,
      electron: process.versions.electron, startupMs, ...results,
      idleSampleSeconds: 30,
      processes: metrics.map(item => ({ type: item.type, cpu: item.cpu.percentCPUUsage,
        workingSetKB: item.memory.workingSetSize }))
    };
    console.log(JSON.stringify(report, null, 2));
    if (process.env.VIBE_PERFORMANCE_REPORT) fs.writeFileSync(process.env.VIBE_PERFORMANCE_REPORT, JSON.stringify(report, null, 2));
  } finally { window.destroy(); }
}
run().then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
