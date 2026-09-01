/**
 * 从 CHANGELOG.md 提取指定版本的用户更新记录，供 GitHub Release 使用。
 * Release 正文因此与仓库维护的版本记录一致，不再自动生成代码提交差异。
 */
const fs = require('node:fs');
const path = require('node:path');
const { extractReleaseNotes } = require('../src/main/release-notes');

function runCli(args = process.argv.slice(2)) {
  const [requestedVersion, outputPath] = args;
  if (!requestedVersion || !outputPath) {
    throw new Error('用法：node scripts/extract-release-notes.js <版本号> <输出文件>');
  }

  const changelogPath = path.resolve(__dirname, '../CHANGELOG.md');
  const notes = extractReleaseNotes(fs.readFileSync(changelogPath, 'utf8'), requestedVersion);
  const resolvedOutputPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, `${notes}\n`, 'utf8');
  console.log(`已提取 ${requestedVersion} 的版本更新记录：${resolvedOutputPath}`);
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { runCli };
