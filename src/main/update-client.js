/** Lightweight RPC client. All updater loading, requests and downloads run in a child process. */
const { app } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
function createUpdateClient({ spawnService = spawn } = {}) {
  let child;
  let ready = false;
  let sequence = 0;
  let parentWindow;
  let quittingForUpdate = false;
  let state = { phase: 'idle' };
  const pending = new Map();
  const publish = status => {
    state = status;
    if (parentWindow && !parentWindow.isDestroyed()) parentWindow.webContents.send('updates:status', status);
  };
  function fail(error) {
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); }
    pending.clear();
    if (!quittingForUpdate) {
      if (state.phase === 'installing') parentWindow?.show();
      publish({ phase: 'error', message: error.message });
    }
  }
  function start() {
    if (child) return;
    ready = false;
    const args = app.isPackaged ? ['--update-service'] : [path.resolve(__dirname, '../..'), '--update-service'];
    const service = spawnService(process.execPath, args, {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
      env: { ...process.env, VIBE_UPDATE_USER_DATA: app.getPath('userData') }
    });
    child = service;
    service.on('message', message => {
      if (child !== service) return;
      if (message.type === 'ready') {
        ready = true;
        for (const task of pending.values()) service.send(task.message);
      } else if (message.type === 'result') {
        const task = pending.get(message.id);
        if (!task) return;
        clearTimeout(task.timer); pending.delete(message.id);
        if (message.error) task.reject(new Error(message.error)); else task.resolve(message.result);
      } else if (message.type === 'status') publish(message.status);
      else if (message.type === 'hide') parentWindow?.hide();
      else if (message.type === 'show') { parentWindow?.show(); parentWindow?.focus(); }
      else if (message.type === 'quit-for-update') { quittingForUpdate = true; app.quit(); }
    });
    service.on('error', error => { if (child === service) { child = null; ready = false; fail(error); } });
    service.on('exit', () => {
      if (child !== service) return;
      child = null; ready = false;
      fail(new Error('更新后台进程已退出，可重新检查更新'));
    });
  }
  function request(method, options) {
    return new Promise((resolve, reject) => {
      try { start(); } catch (error) { reject(error); return; }
      const id = ++sequence;
      const message = { id, method, options };
      const timer = setTimeout(() => {
        pending.delete(id); reject(new Error('更新后台请求超时'));
      }, 120_000);
      pending.set(id, { message, timer, resolve, reject });
      if (ready) child.send(message);
    });
  }
  return {
    checkForUpdates(window, options) { parentWindow = window; return request('check', options); },
    getCurrentRelease: () => request('release'),
    getUpdateState: () => state,
    installUpdate: () => request('install'),
    dispose() {
      quittingForUpdate = true;
      fail(new Error('Application exiting'));
      const service = child; child = null;
      // During update the service is already quitting after starting the installer.
      if (service?.connected) service.disconnect();
    }
  };
}
module.exports = { createUpdateClient };
