/**
 * 逐文件运行 node:test，每个文件仍拥有独立进程，断言失败仍返回非零退出码。
 * 不使用 node --test 的跨进程二进制汇总通道：当前 Node 22/24 在本项目的
 * 异步测试输出中可出现反序列化失败，掩盖真实结果。直接运行测试文件保留原生
 * TAP 文本报告，不跳过测试，也不关闭隔离。可传入文件名，只检查修改的模块。
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function runTests(files, spawn = spawnSync) {
  for (const filename of files) {
    const result = spawn(process.execPath, [filename], { stdio: 'inherit' });
    if (result.error || result.signal || result.status !== 0) return 1;
  }
  return 0;
}

if (require.main === module) {
  const testDirectory = path.resolve(__dirname, '../test');
  const files = process.argv.length > 2
    ? process.argv.slice(2).map((filename) => path.resolve(filename))
    : fs.readdirSync(testDirectory)
      .filter((filename) => filename.endsWith('.test.js'))
      .sort()
      .map((filename) => path.join(testDirectory, filename));
  process.exitCode = runTests(files);
}

module.exports = { runTests };
