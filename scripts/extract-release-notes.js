/**
 * 从 CHANGELOG.md 提取指定版本的用户更新记录，供 GitHub Release 使用。
 * Release 正文因此与仓库维护的版本记录一致，不再自动生成代码提交差异。
 */
const fs = require('node:fs');
const path = require('node:path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractReleaseNotes(markdown, requestedVersion) {
  const version = String(requestedVersion || '').trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`无效的正式版本号：${requestedVersion}`);
  }

  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s+-\\s+[^\\r\\n]+)?\\s*$`, 'm');
  const match = heading.exec(markdown);
  if (!match) {
    throw new Error(`CHANGELOG.md 中缺少版本 ${version} 的更新记录`);
  }

  const contentStart = match.index + match[0].length;
  const remaining = markdown.slice(contentStart);
  const nextSectionOffset = remaining.search(/^## \[/m);
  const referenceOffset = remaining.search(/^\[Unreleased\]:/m);
  const offsets = [nextSectionOffset, referenceOffset].filter((offset) => offset >= 0);
  const contentEnd = offsets.length > 0 ? Math.min(...offsets) : remaining.length;
  const notes = remaining.slice(0, contentEnd).trim();

  if (!notes) {
    throw new Error(`版本 ${version} 的更新记录为空；至少填写“优化了一些功能”`);
  }
  return notes;
}

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

module.exports = { extractReleaseNotes };
