const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const runner = path.resolve(__dirname, '../scripts/run-lessons.mjs');

test('教学入口可从其他目录运行全部实验，示例断言全部通过', () => {
  const result = spawnSync(process.execPath, [runner], { cwd: __dirname, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /06-iteration/);
});

test('教学入口只运行选定课程，并拒绝错误编号', () => {
  const selected = spawnSync(process.execPath, [runner, '03'], { encoding: 'utf8' });
  assert.equal(selected.status, 0, selected.stderr);
  assert.match(selected.stdout, /03-data/);
  assert.doesNotMatch(selected.stdout, /04-async/);
  assert.equal(spawnSync(process.execPath, [runner, '99']).status, 1);
});
