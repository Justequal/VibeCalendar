const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
function subject(options = {}) {
  const children = [];
  const statuses = [];
  let quits = 0;
  const app = { isPackaged: true, getPath: () => 'test-profile', quit: () => quits++ };
  const original = Module._load;
  const filename = require.resolve('../src/main/update-client');
  delete require.cache[filename];
  Module._load = function(name, ...args) {
    return name === 'electron' ? { app } : original.call(this, name, ...args);
  };
  let createUpdateClient;
  try { ({ createUpdateClient } = require(filename)); } finally { Module._load = original; }
  const client = createUpdateClient({ ...options, spawnService: (_exe, args, options) => {
    assert.deepEqual(args, ['--update-service']);
    assert.equal(options.windowsHide, true);
    const child = new EventEmitter();
    child.messages = [];
    child.connected = true;
    child.send = (message, callback) => { child.messages.push(message); callback?.(); };
    child.disconnect = () => { child.connected = false; };
    child.kill = () => { child.killed = true; child.connected = false; };
    children.push(child);
    return child;
  } });
  const window = { isDestroyed: () => false, hide() { this.hidden = true; }, show() { this.hidden = false; }, focus() {},
    webContents: { send: (_channel, status) => statuses.push(status) } };
  return { client, children, statuses, window, quits: () => quits };
}
test('后台就绪前排队，返回与状态消息正确路由', async () => {
  const s = subject();
  const check = s.client.checkForUpdates(s.window);
  const release = s.client.getCurrentRelease();
  const child = s.children[0];
  assert.equal(s.children.length, 1);
  assert.equal(child.messages.length, 0);
  child.emit('message', { type: 'ready' });
  assert.equal(child.messages.length, 2);
  child.emit('message', { type: 'status', status: { phase: 'downloaded', version: '2.0.0' } });
  assert.equal(s.client.getUpdateState().phase, 'downloaded');
  for (const message of child.messages) child.emit('message', { type: 'result', id: message.id, result: message.method });
  assert.equal(await check, 'check');
  assert.equal(await release, 'release');
  s.client.dispose();
  assert.equal(child.connected, false);
});
test('服务崩溃解除等待、恢复安装窗口，下次请求可重新启动', async () => {
  const s = subject();
  const check = s.client.checkForUpdates(s.window);
  const rejected = assert.rejects(check, /后台进程已退出/);
  const child = s.children[0];
  child.emit('message', { type: 'status', status: { phase: 'installing' } });
  child.emit('message', { type: 'hide' });
  assert.equal(s.window.hidden, true);
  child.emit('exit', 1);
  await rejected;
  assert.equal(s.window.hidden, false);
  const next = s.client.getCurrentRelease();
  const nextRejected = assert.rejects(next, /Application exiting/);
  assert.equal(s.children.length, 2);
  s.client.dispose();
  await nextRejected;
});
test('只有后台确认安装退出时才退出主应用', async () => {
  const s = subject();
  const check = s.client.checkForUpdates(s.window);
  const rejected = assert.rejects(check, /Application exiting/);
  const child = s.children[0];
  child.emit('message', { type: 'hide' });
  assert.equal(s.quits(), 0);
  child.emit('message', { type: 'quit-for-update' });
  assert.equal(s.quits(), 1);
  s.client.dispose();
  await rejected;
});

test('请求超时清理失效进程，下次请求重启并忽略旧进程消息', async () => {
  const s = subject({ requestTimeoutMs: 25 });
  const check = s.client.checkForUpdates(s.window);
  const old = s.children[0];
  await assert.rejects(check, /请求超时/);
  assert.equal(old.killed, true);
  assert.equal(s.client.getUpdateState().phase, 'error');
  const retry = s.client.getCurrentRelease();
  const fresh = s.children[1];
  old.emit('message', { type: 'quit-for-update' });
  old.emit('message', { type: 'status', status: { phase: 'downloaded' } });
  assert.equal(s.quits(), 0);
  assert.equal(s.client.getUpdateState().phase, 'error');
  fresh.emit('message', { type: 'ready' });
  fresh.emit('message', { type: 'result', id: fresh.messages[0].id, result: 'recovered' });
  assert.equal(await retry, 'recovered');
  s.client.dispose();
});

test('同步和异步发送失败都解除等待，重复就绪不会重复检查', async () => {
  for (const synchronous of [true, false]) {
    const s = subject();
    const pending = s.client.checkForUpdates(s.window);
    const rejected = assert.rejects(pending, /IPC closed/);
    const child = s.children[0];
    child.send = (_message, callback) => {
      if (synchronous) throw new Error('IPC closed');
      callback(new Error('IPC closed'));
    };
    child.emit('message', { type: 'ready' });
    await rejected;
    assert.equal(child.killed, true);
    s.client.dispose();
  }
  const s = subject();
  const pending = s.client.getCurrentRelease();
  const child = s.children[0];
  child.emit('message', { type: 'ready' });
  child.emit('message', { type: 'ready' });
  assert.equal(child.messages.length, 1);
  child.emit('message', { type: 'result', id: child.messages[0].id, result: true });
  await pending;
  s.client.dispose();
});

test('应用已退出时不再创建后台进程', async () => {
  const s = subject();
  s.client.dispose();
  await assert.rejects(s.client.getCurrentRelease(), /Application exiting/);
  assert.equal(s.children.length, 0);
});
