const test = require('node:test');
const assert = require('node:assert/strict');
const CalendarCore = require('../src/renderer/calendar-core');

test('addMonths 不会在月底跳过目标月份', () => {
  const result = CalendarCore.addMonths(new Date(2026, 7, 31), 1);
  assert.deepEqual(
    [result.getFullYear(), result.getMonth(), result.getDate()],
    [2026, 8, 1]
  );
});

test('addMonths 可以正确跨年', () => {
  const result = CalendarCore.addMonths(new Date(2026, 11, 31), 1);
  assert.deepEqual(
    [result.getFullYear(), result.getMonth(), result.getDate()],
    [2027, 0, 1]
  );
});

test('addDays 可以按星期跨月且不修改原日期', () => {
  const source = new Date(2026, 7, 29);
  const result = CalendarCore.addDays(source, 7);
  assert.deepEqual(
    [result.getFullYear(), result.getMonth(), result.getDate()],
    [2026, 8, 5]
  );
  assert.equal(source.getDate(), 29);
});

test('buildMonthCells 始终生成 42 个连续日期单元格', () => {
  const cells = CalendarCore.buildMonthCells(2026, 7, false);
  assert.equal(cells.length, 42);
  assert.deepEqual(cells[0], {
    year: 2026,
    month: 6,
    day: 26,
    dayOfWeek: 0,
    isCurrentMonth: false
  });
  assert.equal(cells.filter((cell) => cell.isCurrentMonth).length, 31);
});

test('以周一为首日时第一格一定是周一', () => {
  const cells = CalendarCore.buildMonthCells(2026, 7, true);
  assert.equal(cells[0].dayOfWeek, 1);
  assert.deepEqual(CalendarCore.getWeekdayLabels(true), [
    'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  ]);
});

test('星期和月份标题支持中文显示', () => {
  assert.deepEqual(CalendarCore.getWeekdayLabels(false, 'zh-CN'), [
    '日', '一', '二', '三', '四', '五', '六'
  ]);
  assert.equal(CalendarCore.getMonthLabel(2026, 7, 'zh-CN'), '2026年8月');
  assert.equal(CalendarCore.getMonthLabel(2026, 7, 'en'), 'August 2026');
});

test('真正节日本日与同一假期内的普通休息日能够区分', () => {
  assert.equal(CalendarCore.getChineseHolidayKey('国庆节'), 'nationalDay');
  assert.equal(CalendarCore.getChineseHolidayKey('未知假期'), null);
  assert.equal(
    CalendarCore.getChineseFestivalKey(2026, 1, 17, '春节'),
    'springFestival'
  );
  assert.equal(CalendarCore.getChineseFestivalKey(2026, 1, 18, '春节'), null);
  assert.equal(
    CalendarCore.getChineseFestivalKey(2026, 9, 1, '国庆节'),
    'nationalDay'
  );
  assert.equal(CalendarCore.getChineseFestivalKey(2026, 9, 2, '国庆节'), null);
  assert.equal(
    CalendarCore.getChineseFestivalKey(2026, 3, 5, '清明节'),
    'qingming'
  );
});

test('滚动日期窗口以锚点所在周开头并保持 6 行', () => {
  const cells = CalendarCore.buildWeekWindowCells(
    new Date(2026, 8, 5),
    false
  );
  assert.equal(cells.length, 42);
  assert.deepEqual(cells[0], {
    year: 2026,
    month: 7,
    day: 30,
    dayOfWeek: 0,
    isCurrentMonth: false
  });
  assert.deepEqual(cells[7], {
    year: 2026,
    month: 8,
    day: 6,
    dayOfWeek: 0,
    isCurrentMonth: true
  });
});

test('toDateKey 对月份和日期补零', () => {
  assert.equal(CalendarCore.toDateKey(2026, 0, 5), '2026-01-05');
});
