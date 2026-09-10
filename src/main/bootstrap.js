// The update service owns its own Electron event loop and never creates a window.
if (process.argv.includes('--update-service') && process.send) {
  require('./update-service');
} else {
  require('./main');
}
