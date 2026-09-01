const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractReleaseNotes } = require('../src/main/release-notes');

test('按版本提取维护记录且不包含代码差异链接', () => {
  const markdown = `# 更新日志

## [Unreleased]

## [1.2.0] - 2026-09-01

### 改进

- 优化了一些功能

## [1.1.0] - 2026-08-30

- 旧内容

[Unreleased]: https://example.com/compare/v1.2.0...HEAD
[1.2.0]: https://example.com/compare/v1.1.0...v1.2.0
`;

  const notes = extractReleaseNotes(markdown, 'v1.2.0');
  assert.match(notes, /优化了一些功能/);
  assert.doesNotMatch(notes, /compare|旧内容/);
});

test('版本记录缺失、为空或版本号无效时明确失败', () => {
  assert.throws(() => extractReleaseNotes('## [1.0.0]\n', '1.0.0'), /更新记录为空/);
  assert.throws(() => extractReleaseNotes('## [1.0.0]\n\n- 内容', '1.0.1'), /缺少版本/);
  assert.throws(() => extractReleaseNotes('## [1.0.0]\n\n- 内容', 'latest'), /无效的正式版本号/);
});
