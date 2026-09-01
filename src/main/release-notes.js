/**
 * 版本维护记录解析。
 *
 * CHANGELOG.md 同时是 GitHub Release 和应用内当前版本说明的唯一内容来源。
 * 该模块保持无 Electron 依赖，便于发布脚本与单元测试共同使用。
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeStableVersion(requestedVersion) {
  const version = String(requestedVersion || '').trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`无效的正式版本号：${requestedVersion}`);
  }
  return version;
}

function extractReleaseNotes(markdown, requestedVersion) {
  const version = normalizeStableVersion(requestedVersion);
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s+-\\s+[^\\r\\n]+)?\\s*$`, 'm');
  const match = heading.exec(String(markdown || ''));
  if (!match) {
    throw new Error(`CHANGELOG.md 中缺少版本 ${version} 的更新记录`);
  }

  const remaining = markdown.slice(match.index + match[0].length);
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

module.exports = { extractReleaseNotes, normalizeStableVersion };
