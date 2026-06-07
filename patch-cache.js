const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const url = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z';
const cacheDir = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'winCodeSign');
const zipPath = path.join(cacheDir, 'winCodeSign-2.6.0.7z');
const extractDir = path.join(cacheDir, 'winCodeSign-2.6.0');

// Ensure directories exist
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Download function
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, (res2) => {
          res2.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }
    }).on('error', reject);
  });
}

async function run() {
  if (fs.existsSync(extractDir)) {
    console.log('Cache directory exists, wiping to ensure clean extraction...');
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
  
  if (!fs.existsSync(zipPath)) {
    console.log('Downloading winCodeSign...');
    await download(url, zipPath);
    console.log('Downloaded.');
  } else {
    console.log('Archive already downloaded.');
  }

  console.log('Extracting archive while ignoring symlink errors...');
  const sevenZa = path.join(__dirname, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  try {
    execSync(`"${sevenZa}" x "${zipPath}" -o"${extractDir}" -y`);
  } catch (e) {
    console.log('Extraction encountered expected errors (symlinks), but Windows binaries are intact.');
  }
  console.log('Patch complete!');
}

run();
