// Exercise the actual packaged service and electron-updater without installing anything.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const executable = process.argv[2] || path.resolve(__dirname, '../dist/win-unpacked/VibeCalendar.exe');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-update-smoke-'));
const child = spawn(executable, ['--update-service'], {
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  env: { ...process.env, VIBE_UPDATE_USER_DATA: profile }
});
child.stdout.on('data', data => process.stdout.write(data));
child.stderr.on('data', data => process.stderr.write(data));
const timeout = setTimeout(() => { child.kill(); process.exitCode = 1; console.error('Packaged update service timed out'); }, 45000);
let checked = false;
let released = false;
child.on('error', error => { console.error(error); clearTimeout(timeout); process.exitCode = 1; });
child.on('message', message => {
  try {
    if (message.type === 'ready') {
      child.send({ id: 1, method: 'release' });
      child.send({ id: 2, method: 'check' });
    } else if (message.type === 'result') {
      assert.equal(message.error, undefined);
      if (message.id === 1) {
        assert.equal(message.result.version, require('../package.json').version);
        released = true;
      } else if (message.id === 2) {
        assert.equal(message.result.status, 'up-to-date');
        checked = true;
      }
      if (checked && released) child.disconnect();
    }
  } catch (error) { console.error(error); process.exitCode = 1; child.kill(); }
});
child.on('exit', code => {
  clearTimeout(timeout);
  if (code !== 0 || !checked || !released) process.exitCode = 1;
  else console.log('Packaged updater passed: real Electron service, installed release notes, update feed, clean shutdown.');
});
