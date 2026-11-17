// main.js
const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { startAutomation, stopAutomation } = require('./automation');

let win;
let automationRunning = false;

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'dtulogo.png');

  win = new BrowserWindow({
    width: 850,
    height: 820,
    minWidth: 700,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    title: 'Exam Setu Enemy',
    autoHideMenuBar: true,
  });

  win.loadFile('index.html');

  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('start-automation', async (event, data) => {
  if (automationRunning) {
    return { success: false, error: 'Automation is already running.' };
  }

  const { creds, courses, autoLogin } = data;
  automationRunning = true;

  try {
    startAutomation(creds, courses, autoLogin, {
      onStatusUpdate: (message) => {
        if (win && !win.isDestroyed()) win.webContents.send('status-update', message);
      },
      onCourseRegistered: (course) => {
        if (win && !win.isDestroyed()) win.webContents.send('course-registered', course);
      },
      onCourseBlocked: (course) => {
        if (win && !win.isDestroyed()) win.webContents.send('course-blocked', course);
      },
      onNotify: (title, message) => {
        if (Notification.isSupported()) {
          try {
            new Notification({ title, body: message }).show();
          } catch (e) {}
        }
      },
      onError: (error) => {
        if (win && !win.isDestroyed()) win.webContents.send('automation-error', error);
      },
      onStop: () => {
        automationRunning = false;
        if (win && !win.isDestroyed()) win.webContents.send('status-update', 'Automation stopped.');
      },
    });
    return { success: true };
  } catch (error) {
    automationRunning = false;
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-automation', async () => {
  if (automationRunning) {
    stopAutomation();
    automationRunning = false;
  }
  return { success: true };
});
