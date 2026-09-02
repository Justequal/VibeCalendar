const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const packageMetadata = require('../package.json');

test('Windows 安装器固定使用机器级记录和 VibeCalendar 最终目录', () => {
  const nsis = packageMetadata.build.nsis;
  assert.equal(nsis.oneClick, false);
  assert.equal(nsis.perMachine, true);
  assert.equal(nsis.allowToChangeInstallationDirectory, true);
  assert.equal(nsis.include, 'build/installer.nsh');

  const installerScript = fs.readFileSync(
    path.resolve(__dirname, '../build/installer.nsh'),
    'utf8'
  );
  assert.match(installerScript, /ReadRegStr \$R0 HKLM/);
  assert.match(installerScript, /ReadRegStr \$R0 HKCU/);
  assert.match(installerScript, /StrCpy \$INSTDIR "\$INSTDIR\\VibeCalendar"/);
  assert.match(installerScript, /Page custom NormalizeVibeCalendarInstallDirPage/);
  assert.match(installerScript, /EM_SETREADONLY/);
});
