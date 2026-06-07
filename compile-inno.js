const inno = require('innosetup-compiler');
const path = require('path');

console.log('Compiling standard Setup Wizard using Inno Setup...');

inno(path.join(__dirname, 'installer.iss'), function (error) {
    if (error) {
        console.error('Compilation failed:', error);
    } else {
        console.log('Successfully generated the wizard installer: dist/installer/VibeCalendar-Setup-Wizard.exe');
    }
});
