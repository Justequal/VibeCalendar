/** 实验1：纯函数。修改输入观察输出；断言把预期变成可执行说明。 */
import assert from 'node:assert/strict';
import core from '../src/renderer/calendar-core.js';

export function run() {
  // 月份从0开始。不要使用字符串解析日期，以免把时区问题混入第一课。
  const original = core.createDate(2026, 11, 1);
  const next = core.addMonths(original, 1);
  assert.equal(next.getFullYear(), 2027);
  assert.equal(next.getMonth(), 0);
  assert.equal(original.getMonth(), 11); // 输入没有被修改。
  return { original: core.toDateKey(2026, 11, 1), next: core.toDateKey(2027, 0, 1) };
}
