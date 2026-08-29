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

test('toDateKey 对月份和日期补零', () => {
  assert.equal(CalendarCore.toDateKey(2026, 0, 5), '2026-01-05');
});
