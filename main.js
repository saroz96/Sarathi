const { app, BrowserWindow } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const mongoose = require('mongoose');

let win;

// Function to create the Electron window
function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, 'public/assets/icons/icon.ico'), // Set the same icon here
    webPreferences: {
      nodeIntegration: true
    }
  });

  // Load your EJS-based app in Electron
  win.loadURL('http://localhost:3000'); // Assuming your server runs on port 3000

  // Open DevTools (optional)
  // win.webContents.openDevTools();
}

// This runs when the Electron app is ready
app.whenReady().then(() => {
  // Start the MongoDB server (if required)
  // You can remove or customize this if you're using a cloud DB like MongoDB Atlas
  mongoose.connect('mongodb+srv://saroj:12345@cluster0.vgu4kmg.mongodb.net/Sarathi', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      console.log('MongoDB connected');
      // Start the Express server
      exec('npm start', (err, stdout, stderr) => {
        if (err) {
          console.error(`Error starting server: ${err}`);
          return;
        }
        console.log(stdout);
      });

      // Create the Electron window
      createWindow();
    })
    .catch(err => {
      console.log('MongoDB connection error:', err);
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
//-------------------------------------------------------------------------

// const { app, BrowserWindow } = require('electron');
// const express = require('express');
// const path = require('path');

// let mainWindow;

// function createExpressApp() {
//     const server = express();

//     // Static files (if needed)
//     server.use(express.static(path.join(__dirname, 'public')));

//     // Your routes
//     server.get('/', (req, res) => {
//         res.sendFile(path.join(__dirname, 'views', 'index.html'));
//     });

//     // Connect mongoose, other middlewares, routes
//     // (copy from your app.js)

//     // Start server
//     server.listen(3000, () => {
//         console.log('Express server running on http://localhost:3000');
//     });
// }

// function createWindow() {
//     mainWindow = new BrowserWindow({
//         width: 1200,
//         height: 800,
//         webPreferences: {
//             nodeIntegration: true,
//             contextIsolation: false,
//         }
//     });

//     mainWindow.loadURL('http://localhost:3000');

//     mainWindow.on('closed', function () {
//         mainWindow = null;
//     });
// }

// app.whenReady().then(() => {
//     createExpressApp();   // Start the Express server
//     createWindow();       // Then open Electron window
// });

// app.on('window-all-closed', function () {
//     if (process.platform !== 'darwin') {
//         app.quit();
//     }
// });

// app.on('activate', function () {
//     if (BrowserWindow.getAllWindows().length === 0) createWindow();
// });

// const { app: electronApp, BrowserWindow } = require('electron');
// const path = require('path');

// // Require your real Express app
// const expressApp = require('./app');  // 👈 your full app.js

// let mainWindow;

// function startServer() {
//     expressApp.listen(3000, () => {
//         console.log('Express server running on http://localhost:3000');
//     });
// }

// function createWindow() {
//     mainWindow = new BrowserWindow({
//         width: 1200,
//         height: 800,
//         webPreferences: {
//             nodeIntegration: true,
//             contextIsolation: false,
//         }
//     });

//     mainWindow.loadURL('http://localhost:3000');

//     mainWindow.on('closed', function () {
//         mainWindow = null;
//     });
// }

// electronApp.whenReady().then(() => {
//     startServer();   // Start Express server first
//     createWindow();  // Then open Electron window
// });

// electronApp.on('window-all-closed', function () {
//     if (process.platform !== 'darwin') {
//         electronApp.quit();
//     }
// });

// electronApp.on('activate', function () {
//     if (BrowserWindow.getAllWindows().length === 0) createWindow();
// });
//-----------------------------------------------------------------------

// const { app: electronApp, BrowserWindow } = require('electron');
// const path = require('path');

// // Import your Express app
// const expressApp = require('./app');  // Your full app.js

// let mainWindow;
// let server;  // To keep reference to the Express server

// function startServer() {
//     return new Promise((resolve, reject) => {
//         try {
//             server = expressApp.listen(3000, () => {
//                 console.log('Express server running on http://localhost:3000');
//                 resolve();
//             });
//         } catch (error) {
//             console.error('Failed to start server:', error);
//             reject(error);
//         }
//     });
// }

// function createWindow() {
//     mainWindow = new BrowserWindow({
//         width: 1200,
//         height: 800,
//         webPreferences: {
//             nodeIntegration: true,
//             contextIsolation: false,
//             webSecurity: false, // Disable only for development

//             // Enable these if you're using newer JavaScript features
//             worldSafeExecuteJavaScript: true,
//             allowRunningInsecureContent: true
//         }
//     });

//     mainWindow.loadURL('http://localhost:3000');
//     mainWindow.webContents.openDevTools(); // Open DevTools for debugging

//     mainWindow.on('closed', function () {
//         mainWindow = null;
//     });
// }

// electronApp.whenReady().then(async () => {
//     await startServer();   // Make sure server is fully started
//     createWindow();        // Then open Electron window
// });

// electronApp.on('window-all-closed', function () {
//     if (process.platform !== 'darwin') {
//         if (server) {
//             server.close();  // Close Express server when app quits
//         }
//         electronApp.quit();
//     }
// });

// electronApp.on('activate', function () {
//     if (BrowserWindow.getAllWindows().length === 0) createWindow();
// });


