const test = require('node:test');
const assert = require('node:assert/strict');
const dates = require('../src/renderer/festival-dates');
const { parseCalendar } = require('../scripts/sync-festival-dates');

test('官方日期表覆盖200年且每项为该年有效日期', () => {
  assert.equal(Object.keys(dates).length, 200);
  for (let year = 1901; year <= 2100; year += 1) {
    assert.equal(Object.keys(dates[year]).length, 4);
    for (const value of Object.values(dates[year])) {
      assert.match(value, /^\d{2}-\d{2}$/);
      assert.equal(new Date(`${year}-${value}T12:00:00Z`).toISOString().slice(0, 10), `${year}-${value}`);
    }
  }
});

test('旧版月份大小写和重复闰月不会把端午顺延一个月', () => {
  const result = parseCalendar([
    '1903/01/29     1st Lunar month     Thursday',
    '1903/04/06     9                   Monday         Bright & Clear',
    '1903/05/27     5th Lunar month     Wednesday',
    '1903/05/31     5                   Sunday',
    '1903/06/25     5th Lunar month     Thursday',
    '1903/06/29     5                   Monday',
    '1903/09/21     8th Lunar month     Monday',
    '1903/10/05     15                  Monday'
  ].join('\n'), 1903);
  assert.deepEqual(result, {
    springFestival: '01-29', qingming: '04-06', dragonBoat: '05-31', midAutumn: '10-05'
  });
  assert.throws(() => parseCalendar('invalid', 1903), /Incomplete/);
});
