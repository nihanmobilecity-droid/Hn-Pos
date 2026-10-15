const { app, BrowserWindow } = require('electron');

// ব্যাকগ্রাউন্ডে Node.js সার্ভার চালু রাখা
require('./server.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    title: "Hridoy And Nusrat Mobile Zone",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 1200);

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
