/** 实验2：动作日志可以重放。reduce把数组逐项交给同一个状态转换函数。 */
import assert from 'node:assert/strict';
import core from '../src/renderer/calendar-core.js';
import state from '../src/renderer/calendar-state.js';

export function run() {
  const initial = { visibleDate: core.createDate(2026, 11, 1), language: 'zh-CN', startOnMonday: true };
  const actions = [{ type: 'move-month', offset: 1 }, { type: 'toggle-language' }];
  const final = actions.reduce(state.transition, initial);
  assert.equal(final.visibleDate.getFullYear(), 2027);
  assert.equal(final.language, 'en');
  assert.equal(initial.language, 'zh-CN');
  return { actions, language: final.language, year: final.visibleDate.getFullYear() };
}
