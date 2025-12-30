/**
 * Electron Main Process
 * Manages window creation and Python backend lifecycle
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let pythonProcess = null;
const API_PORT = 8765;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Get the path to the Python backend executable
 */
function getBackendPath() {
  if (isDev) {
    // In development, run Python directly
    return null;
  }

  // In production, use bundled executable
  const resourcesPath = process.resourcesPath;
  return path.join(resourcesPath, 'backend', 'watermark-backend.exe');
}

/**
 * Start the Python backend server
 */
async function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = getBackendPath();

    if (isDev) {
      // In development, assume backend is running separately
      console.log('Development mode: Please start backend manually');
      console.log('Run: cd backend && python main.py');
      resolve(true);
      return;
    }

    console.log('Starting backend from:', backendPath);

    // Check if backend exists
    if (!fs.existsSync(backendPath)) {
      console.error('Backend executable not found at:', backendPath);
      reject(new Error('Backend executable not found'));
      return;
    }

    pythonProcess = spawn(backendPath, [], {
      env: { ...process.env, WATERMARK_API_PORT: API_PORT.toString() },
      windowsHide: true,  // Hide console window on Windows
      detached: false
    });

    pythonProcess.stdout.on('data', (data) => {
      console.log(`Backend stdout: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Backend stderr: ${data}`);
    });

    pythonProcess.on('error', (error) => {
      console.error('Failed to start backend:', error);
      reject(error);
    });

    pythonProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
      pythonProcess = null;
    });

    // Wait for backend to be ready
    waitForBackend(30000)
      .then(() => resolve(true))
      .catch((err) => reject(err));
  });
}

/**
 * Wait for the backend to be ready by polling the health endpoint
 */
async function waitForBackend(timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const isReady = await checkBackendHealth();
      if (isReady) {
        console.log('Backend is ready!');
        return true;
      }
    } catch (e) {
      // Backend not ready yet
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error('Backend failed to start within timeout');
}

/**
 * Check if backend is healthy
 */
function checkBackendHealth() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: API_PORT,
      path: '/health',
      method: 'GET',
      timeout: 2000
    }, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        reject(new Error(`Health check failed: ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check timeout'));
    });

    req.end();
  });
}

/**
 * Stop the Python backend server
 */
function stopBackend() {
  if (pythonProcess) {
    console.log('Stopping backend...');

    // On Windows, we need to kill the process tree
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid, '/f', '/t'], {
        windowsHide: true
      });
    } else {
      pythonProcess.kill('SIGTERM');
    }

    pythonProcess = null;
  }
}

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false  // Allow preload to use Node.js features
    },
    backgroundColor: '#1a1a2e',
    show: false
  });

  // Load the frontend
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('select-images', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }
    ]
  });

  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('select-watermark', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
    ]
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-output-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-api-port', () => {
  return API_PORT;
});

ipcMain.handle('get-default-output-dir', () => {
  const desktop = path.join(os.homedir(), 'Desktop');
  return path.join(desktop, 'WatermarkedImages');
});

ipcMain.handle('read-image-base64', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();

    let mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') {
      mimeType = 'image/jpeg';
    } else if (ext === '.webp') {
      mimeType = 'image/webp';
    } else if (ext === '.bmp') {
      mimeType = 'image/bmp';
    }

    return {
      path: filePath,
      name: path.basename(filePath),
      data: `data:${mimeType};base64,${base64}`
    };
  } catch (error) {
    console.error('Error reading image:', error);
    throw error;
  }
});

// App lifecycle
app.whenReady().then(async () => {
  try {
    await startBackend();
    createWindow();
  } catch (error) {
    console.error('Failed to start application:', error);
    dialog.showErrorBox('Startup Error', `Failed to start the application: ${error.message}`);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('will-quit', () => {
  stopBackend();
});
