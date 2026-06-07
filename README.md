# Vibe Calendar (Hello World) 🚀

This is an AI-assisted "Hello World" desktop application built with Electron, featuring a modern Glassmorphism design aesthetic, dark mode gradients, a real-time clock, and smooth CSS animations.

## 📁 Project Structure
The project is structured professionally for scalability:
```
VibeCalendar/
├── src/
│   ├── main/
│   │   └── main.js        # Electron backend (window creation, OS lifecycle)
│   └── renderer/
│       ├── index.html     # Frontend UI structure
│       ├── style.css      # Modern Glassmorphism styles
│       ├── holidays.js    # Multi-source Chinese holiday validation logic
│       └── renderer.js    # Frontend logic (calendar grid, clock, scrolling)
├── build-installer.js     # Script to generate Setup.exe
├── compile-inno.js        # Script to compile the standard Setup Wizard
├── installer.iss          # Inno Setup wizard configuration
├── patch-cache.js         # Script to bypass electron-builder Mac symlink issues
├── package.json           # Dependencies and build configurations
└── README.md              # Project documentation
```

## 🛠️ How to Run Locally
To develop and run the application on your computer:
1. Ensure [Node.js](https://nodejs.org/) is installed.
2. Open a terminal in the project directory.
3. Install dependencies (if you haven't already):
   ```bash
   npm install
   ```
4. Start the app:
   ```bash
   npm start
   ```

## 📦 How to Build (.exe)
We use `electron-builder` to package this app into a distributable Windows executable.
To build the `.exe` file locally:
```bash
npm run build
```
Once the process finishes, you will find a new `dist/` folder containing the `Vibe Calendar Setup.exe` installer!

## ☁️ Cloud Auto-Build (GitHub Actions)
If you upload this project to GitHub, it will automatically build the `.exe` file for you on every push! 
Check the `.github/workflows/build.yml` file to see how the cloud automation is configured.
