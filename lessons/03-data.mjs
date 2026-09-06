/** 实验3：适配器统一字段；数组管道在统一数据上工作，无需知道接口来源。 */
import assert from 'node:assert/strict';
import data from '../src/renderer/holiday-data.js';

export function run() {
  const raw = { days: [{ date: '2026-01-01', name: '元旦', isOffDay: true }] };
  const normalized = data.normalizeNateData(raw, 2026);
  const names = Object.values(normalized).filter(record => record.isHoliday).map(record => record.name);
  assert.deepEqual(names, ['元旦']);
  assert.equal(Object.isFrozen(normalized), true);
  // JSON语法正确仍可能字段错误。数据边界应拒绝错误输入，而不是让界面猜测。
  assert.throws(() => data.normalizeNateData({ days: [] }, 2026));
  return { normalized, names };
}
