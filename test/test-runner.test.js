const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runTests } = require('../scripts/run-tests');

test('测试启动器按顺序运行全部文件，保留独立进程与原始报告', () => {
  const calls = [];
  const result = runTests(['first.test.js', 'second.test.js'], (...args) => {
    calls.push(args);
    return { status: 0 };
  });
  assert.equal(result, 0);
  assert.deepEqual(calls, [
    [process.execPath, ['first.test.js'], { stdio: 'inherit' }],
    [process.execPath, ['second.test.js'], { stdio: 'inherit' }]
  ]);
});

test('测试启动器不会把断言失败、启动失败或异常终止报告为成功', () => {
  for (const result of [{ status: 1 }, { error: new Error('spawn failed') }, { signal: 'SIGTERM' }]) {
    assert.equal(runTests(['sample.test.js'], () => result), 1);
  }
});
