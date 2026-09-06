/** Compare live provider data against the published State Council schedule. */
const assert = require('node:assert/strict');
const { HolidayManager } = require('../src/renderer/holidays');
const official = require('../test/fixtures/official-holidays-2026.json');

async function run() {
  const manager = new HolidayManager({ storage: null, requestTimeout: 15000 });
  const records = await manager.fetchHolidays(official.year);
  assert.match(manager.cache.get(official.year).source, /^remote-/);
  const expected = new Map();
  for (const [start, end] of official.holidays) {
    for (let day = new Date(`${official.year}-${start}T12:00:00Z`);
      day <= new Date(`${official.year}-${end}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
      expected.set(day.toISOString().slice(0, 10), true);
    }
  }
  for (const day of official.workdays) expected.set(`${official.year}-${day}`, false);
  for (const [day, isHoliday] of expected) assert.equal(records[day]?.isHoliday, isHoliday, day);
  for (const day of Object.keys(records)) assert.ok(expected.has(day), `Unexpected special date: ${day}`);
  console.log(`Official holiday check passed: ${expected.size} special dates, ${manager.cache.get(official.year).source}.`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
