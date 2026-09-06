/** 实验6：生成器按需产生行。仅用于认识迭代协议；生产网格仍用直观的数组渲染。 */
import assert from 'node:assert/strict';
import core from '../src/renderer/calendar-core.js';

function* weeks(cells) {
  // yield暂停函数，下次迭代才继续。这里输入已是数组，所以不会节省输入的内存。
  for (let offset = 0; offset < cells.length; offset += 7) yield cells.slice(offset, offset + 7);
}

export function run() {
  const cells = core.buildWeekWindowCells(core.createDate(2026, 0, 1), true);
  const rows = [...weeks(cells)]; // 展开会消费完整迭代器；for…of中break则可以提前停止。
  assert.equal(rows.length, 6);
  assert.ok(rows.every(row => row.length === 7));
  assert.deepEqual(rows.flat(), cells);
  return { rows: rows.length, cells: rows.flat().length };
}
