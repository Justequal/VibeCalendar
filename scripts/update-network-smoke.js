/** 使用真实 GitHub Releases API 验证公告查询与开发版手动检查。 */
const { app } = require('electron');
const assert = require('node:assert/strict');
const packageMetadata = require('../package.json');

// 该脚本直接作为 Electron 入口运行，不会自动读取项目包版本；显式对齐正式入口。
app.getVersion = () => packageMetadata.version;
const { checkForUpdates, getLatestRelease } = require('../src/main/updater');

app.whenReady()
  .then(async () => {
    const release = await getLatestRelease({ forceRefresh: true });
    assert.match(release.version, /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i);
    assert.equal(typeof release.title, 'string');

    const result = await checkForUpdates(undefined, { manual: true });
    assert.ok(['available', 'up-to-date'].includes(result.status));
    assert.equal(result.currentVersion, packageMetadata.version);
    assert.equal(result.latestVersion, release.version);

    console.log(
      `Update network smoke passed: current v${result.currentVersion}, latest v${release.version}, status ${result.status}.`
    );
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
