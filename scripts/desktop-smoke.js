/** Real main/preload/renderer/service integration using an isolated profile. */
const { app, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = process.env.VIBE_TEST_APP_ROOT || path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-desktop-'));
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.disableHardwareAcceleration();
const deadline = setTimeout(() => { console.error('Desktop smoke timed out'); app.exit(1); }, 25000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate) {
  for (let i = 0; i < 200; i++) { if (await predicate()) return; await delay(25); }
  throw new Error('Desktop state timed out');
}
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => callback({ cancel: true }));
});
const lifecycle = require(path.join(root, 'src/main/main'));
async function run() {
  await app.whenReady();
  await waitFor(() => lifecycle.getMainWindow()?.isVisible());
  const window = lifecycle.getMainWindow();
  await waitFor(() => window.webContents.executeJavaScript('Boolean(window.appWindow && document.getElementById("close-btn"))'));
  await window.webContents.executeJavaScript('document.getElementById("close-btn").click()');
  await waitFor(() => !window.isVisible());
  assert.equal(window.isDestroyed(), false);
  assert.equal(lifecycle.getTray().isDestroyed(), false);
  assert.equal(window.isVisible(), false);
  lifecycle.getTray().emit('click');
  await waitFor(() => window.isVisible());
  window.close();
  await waitFor(() => !window.isVisible());
  lifecycle.revealMainWindow();
  assert.equal(window.isVisible(), true);
  // Real child process, real updater module, no network needed for installed notes.
  const client = require(path.join(root, 'src/main/update-client')).createUpdateClient();
  try {
    const release = await client.getCurrentRelease();
    assert.equal(release.version, require(path.join(root, 'package.json')).version);
    assert.ok(release.notes.length > 0);
    assert.equal(require.cache[require.resolve(path.join(root, 'src/main/updater'))], undefined,
      'Window main process must never load the heavy updater module');
  } finally { client.dispose(); }
  console.log('Desktop smoke passed: X via preload IPC, real tray hide/restore, native close, independent update service.');
  clearTimeout(deadline);
  app.quit();
}
run().catch(error => { console.error(error); app.exit(1); });
