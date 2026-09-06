const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const service = require('../src/renderer/holidays');
const data = require('../src/renderer/holiday-data');

function subject() {
  let time = 0;
  let created = 0;
  const messages = [];
  const local = service.createHolidayManager({ fetchImpl: null, storage: null });
  const worker = { postMessage: message => messages.push(message), terminate() {} };
  const window = { holidayManager: local, HolidayData: data };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/renderer/holiday-background.js'), 'utf8'), {
    window, performance: { now: () => time }, setTimeout, clearTimeout
  });
  const manager = window.createBackgroundHolidayManager({ local, now: () => time, createWorker: () => { created += 1; return worker; } });
  return { manager, worker, local, messages, created: () => created, setTime: value => { time = value; } };
}

test('前59999毫秒不创建线程，在线恢复和翻年也不能绕过延迟', async () => {
  const s = subject();
  await s.manager.fetchHolidays(2026);
  s.setTime(59999);
  await s.manager.fetchHolidays(2027, { retryFallback: true });
  assert.equal(s.created(), 0);
  assert.equal(s.messages.length, 0);
  s.setTime(60000);
  const pending = s.manager.fetchHolidays(2026);
  assert.equal(s.created(), 1);
  assert.equal(s.messages.length, 1);
  s.manager.dispose();
  await pending;
});

test('跨线程返回恢复只读快照，同年合并请求并保留有效缓存', async () => {
  const s = subject();
  s.setTime(60000);
  const first = s.manager.fetchHolidays(2026);
  const second = s.manager.fetchHolidays(2026);
  assert.equal(s.messages.length, 1);
  const request = s.messages[0];
  s.worker.onmessage({ data: { id: request.id, year: 2026, entry: {
    source: 'remote-merged', expiresAt: Date.now() + 60000,
    data: { '2026-01-01': { name: '元旦', isHoliday: true, festival: 'newYear' } }
  } } });
  const result = await first;
  assert.equal(await second, result);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result['2026-01-01']), true);
  assert.equal(await s.manager.fetchHolidays(2026), result);
  assert.equal(s.messages.length, 1);
  s.manager.dispose();
});

test('线程失败清空等待，冷却期不重启或退回主线程联网', async () => {
  const s = subject();
  s.setTime(60000);
  const pending = s.manager.fetchHolidays(2026);
  s.worker.onerror();
  assert.equal(await pending, s.local.getHolidays(2026));
  assert.equal(s.manager.pendingRequests.size, 0);
  await s.manager.fetchHolidays(2026);
  assert.equal(s.created(), 1);
  s.manager.dispose();
});

test('快速翻年时等待数量有界，并保留最终浏览年份', async () => {
  const s = subject();
  s.setTime(60000);
  const requests = [];
  for (let year = 2020; year <= 2030; year += 1) requests.push(s.manager.fetchHolidays(year));
  assert.equal(s.manager.pendingRequests.size, 6);
  assert.equal(s.manager.pendingRequests.has(2030), true);
  assert.equal(s.manager.pendingRequests.has(2020), false);
  s.manager.dispose();
  await Promise.all(requests);
});
