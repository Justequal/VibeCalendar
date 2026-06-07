const electronInstaller = require('electron-winstaller');

async function buildInstaller() {
  console.log('Building single-file Setup.exe installer...');
  try {
    await electronInstaller.createWindowsInstaller({
      appDirectory: './dist/Vibe Calendar-win32-x64',
      outputDirectory: './dist/installer',
      authors: 'Vibe Developer',
      exe: 'Vibe Calendar.exe',
      description: 'A beautiful desktop calendar.',
      noMsi: true,
      setupExe: 'VibeCalendar-Setup.exe'
    });
    console.log('Installer build successful! Check dist/installer/VibeCalendar-Setup.exe');
  } catch (e) {
    console.error(`Installer build failed: ${e.message}`);
  }
}

buildInstaller();
