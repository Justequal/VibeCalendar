const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
function subject() {
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
  const client = createUpdateClient({ spawnService: (_exe, args, options) => {
    assert.deepEqual(args, ['--update-service']);
    assert.equal(options.windowsHide, true);
    const child = new EventEmitter();
    child.messages = [];
    child.connected = true;
    child.send = (message, callback) => { child.messages.push(message); callback?.(); };
    child.disconnect = () => { child.connected = false; };
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
