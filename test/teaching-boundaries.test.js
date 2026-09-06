const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const renderer = path.resolve(__dirname, '../src/renderer');

test('按HTML顺序加载计算层，浏览器入口与Node入口具有相同数据契约', () => {
  const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
  const modules = ['festival-dates.js', 'calendar-core.js', 'calendar-state.js', 'holiday-data.js'];
  // 故意不提供require、DOM、fetch或存储，防止计算模块悄悄依赖运行环境。
  const window = {};
  const context = vm.createContext({ window });
  for (const filename of scripts.filter(name => modules.includes(name))) {
    vm.runInContext(fs.readFileSync(path.join(renderer, filename), 'utf8'), context, { filename });
  }
  assert.equal(scripts.filter(name => modules.includes(name)).length, modules.length);
  const raw = { days: [{ date: '2026-01-01', name: '元旦', isOffDay: true }] };
  const expected = require('../src/renderer/holiday-data').normalizeNateData(raw, 2026);
  // 不同vm拥有不同对象原型，比较可序列化契约，而非跨环境原型身份。
  assert.equal(JSON.stringify(window.HolidayData.normalizeNateData(raw, 2026)), JSON.stringify(expected));
  const after = window.CalendarState.transition({ visibleDate: window.CalendarCore.createDate(2026, 11, 1) }, { type: 'move-month', offset: 1 });
  assert.equal(after.visibleDate.getFullYear(), 2027);
  assert.ok(scripts.indexOf('holiday-data.js') < scripts.indexOf('holidays.js'));
  assert.ok(scripts.indexOf('calendar-state.js') < scripts.indexOf('renderer.js'));
});
