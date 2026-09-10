const { app } = require('electron');
const path = require('node:path');
app.disableHardwareAcceleration();
// Separate Chromium cache/session files; installer cache remains electron-updater's default.
app.setPath('userData', path.join(process.env.VIBE_UPDATE_USER_DATA || app.getPath('userData'), 'update-service'));
const send = message => { if (process.connected) process.send(message); };
let installing = false;
let updater;
const parentWindow = {
  isDestroyed: () => !process.connected,
  webContents: { send: (_channel, status) => send({ type: 'status', status }) },
  hide: () => { installing = true; send({ type: 'hide' }); },
  show: () => { installing = false; send({ type: 'show' }); },
  focus: () => {}
};
app.on('before-quit', () => {
  if (installing) send({ type: 'quit-for-update' });
});
process.on('disconnect', () => app.exit(0));
app.whenReady().then(() => {
  updater = require('./updater');
  process.on('message', async message => {
    const { id, method, options } = message || {};
    try {
      let result;
      if (method === 'check') result = await updater.checkForUpdates(parentWindow, options);
      else if (method === 'release') result = updater.getCurrentRelease();
      else if (method === 'install') result = updater.installUpdate();
      else throw new Error('Unsupported update operation');
      send({ type: 'result', id, result });
    } catch (error) { send({ type: 'result', id, error: error.message }); }
  });
  send({ type: 'ready' });
});
