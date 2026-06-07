[Setup]
AppName=Vibe Calendar
AppVersion=1.0.0
DefaultDirName={pf}\Vibe Calendar
DefaultGroupName=Vibe Calendar
UninstallDisplayIcon={app}\Vibe Calendar.exe
Compression=lzma2
SolidCompression=yes
OutputDir=dist\installer
OutputBaseFilename=VibeCalendar-Setup-Wizard

[Files]
Source: "dist\VibeCalendar-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Vibe Calendar"; Filename: "{app}\VibeCalendar.exe"
Name: "{commondesktop}\Vibe Calendar"; Filename: "{app}\VibeCalendar.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop icon"; GroupDescription: "Additional icons:"
