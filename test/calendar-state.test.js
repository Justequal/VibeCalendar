const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/renderer/calendar-core');
const { transition } = require('../src/renderer/calendar-state');

function initial(year = 2026, month = 11) {
  return Object.freeze({ visibleDate: core.createDate(year, month, 1), language: 'zh-CN', startOnMonday: true, renderVersion: 9 });
}

test('动作跨年且保留异步序号，不修改旧日期或偏好', () => {
  const before = initial();
  const timestamp = before.visibleDate.getTime();
  const after = [{ type: 'move-month', offset: 1 }, { type: 'toggle-language' }, { type: 'toggle-week-start' }].reduce(transition, before);
  assert.equal(after.visibleDate.getFullYear(), 2027);
  assert.equal(after.visibleDate.getMonth(), 0);
  assert.equal(after.language, 'en');
  assert.equal(after.startOnMonday, false);
  assert.equal(after.renderVersion, 9);
  assert.equal(before.visibleDate.getTime(), timestamp);
  assert.equal(before.language, 'zh-CN');
});

test('回到今天使用显式时钟，未知动作保持原对象', () => {
  const before = initial();
  const now = core.createDate(2030, 3, 17);
  const after = transition(before, { type: 'go-today', now });
  assert.equal(after.visibleDate.getDate(), 1);
  assert.equal(after.visibleDate.getFullYear(), 2030);
  assert.equal(now.getDate(), 17);
  assert.equal(transition(before, { type: 'unknown' }), before);
});

test('极端星期偏移仍限制在支持年份内', () => {
  assert.equal(transition(initial(), { type: 'move-week', offset: 1e20 }).visibleDate.getFullYear(), 9999);
  assert.equal(transition(initial(), { type: 'move-week', offset: -1e20 }).visibleDate.getFullYear(), 1);
});
