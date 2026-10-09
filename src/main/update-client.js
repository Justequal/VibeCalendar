/** 轻量更新代理：后台通信失败时解除等待并清理进程，下次请求可重新启动。 */
const { app } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
function createUpdateClient({ spawnService = spawn, requestTimeoutMs = 120_000 } = {}) {
  let child;
  let ready = false;
  let sequence = 0;
  let parentWindow;
  let quittingForUpdate = false;
  let disposed = false;
  let state = { phase: 'idle' };
  const pending = new Map();
  const hasWindow = () => parentWindow && !parentWindow.isDestroyed();
  const publish = status => {
    state = status;
    if (hasWindow() && !parentWindow.webContents.isDestroyed?.()) parentWindow.webContents.send('updates:status', status);
  };
  function fail(error) {
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); }
    pending.clear();
    if (!quittingForUpdate) {
      if (state.phase === 'installing' && hasWindow()) parentWindow.show();
      publish({ phase: 'error', message: error.message });
    }
  }
  // 先取消当前引用，避免旧进程的迟到消息或退出事件污染新一轮请求。
  function stopService(service, error) {
    if (child !== service) return;
    child = null;
    ready = false;
    service.kill?.();
    fail(error);
  }
  function sendTask(service, task) {
    try {
      service.send(task.message, error => {
        if (error) stopService(service, error);
      });
    } catch (error) { stopService(service, error); }
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
        if (ready) return;
        ready = true;
        for (const task of pending.values()) sendTask(service, task);
      } else if (message.type === 'result') {
        const task = pending.get(message.id);
        if (!task) return;
        clearTimeout(task.timer); pending.delete(message.id);
        if (message.error) task.reject(new Error(message.error)); else task.resolve(message.result);
      } else if (message.type === 'status') publish(message.status);
      else if (message.type === 'hide' && hasWindow()) parentWindow.hide();
      else if (message.type === 'show' && hasWindow()) { parentWindow.show(); parentWindow.focus(); }
      else if (message.type === 'quit-for-update') { quittingForUpdate = true; app.quit(); }
    });
    service.on('error', error => stopService(service, error));
    service.on('exit', () => {
      if (child !== service) return;
      child = null; ready = false;
      fail(new Error('更新后台进程已退出，可重新检查更新'));
    });
  }
  function request(method, options) {
    return new Promise((resolve, reject) => {
      if (disposed) { reject(new Error('Application exiting')); return; }
      try { start(); } catch (error) { reject(error); return; }
      const service = child;
      const id = ++sequence;
      const message = { id, method, options };
      const timer = setTimeout(() => {
        stopService(service, new Error('更新后台请求超时，可重新检查更新'));
      }, requestTimeoutMs);
      const task = { message, timer, resolve, reject };
      pending.set(id, task);
      if (ready) sendTask(service, task);
    });
  }
  return {
    checkForUpdates(window, options) { parentWindow = window; return request('check', options); },
    getCurrentRelease: () => request('release'),
    getUpdateState: () => state,
    installUpdate: () => request('install'),
    dispose() {
      disposed = true;
      quittingForUpdate = true;
      fail(new Error('Application exiting'));
      const service = child; child = null;
      // 安装时后台服务已启动安装器；普通退出则通过断开连接结束服务。
      if (service?.connected) service.disconnect();
    }
  };
}
module.exports = { createUpdateClient };
