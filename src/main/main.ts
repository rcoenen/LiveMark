import { app, BrowserWindow, dialog, Menu, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { FileWatcher } from './fileWatcher';

// Set app name for development mode
app.setName('LiveMark');

// Set About panel options
app.setAboutPanelOptions({
  applicationName: 'LiveMark',
  applicationVersion: '1.2.1',
  version: '1.2.1',
  copyright: 'Live-updating Markdown viewer for macOS',
});

let mainWindow: BrowserWindow | null = null;
let fileWatcher: FileWatcher | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 400,
    minHeight: 300,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (fileWatcher) {
      fileWatcher.close();
      fileWatcher = null;
    }
  });
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Install CLI Command...',
          click: () => installCLI(),
          enabled: !isCLIInstalled(),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            await openFileDialog();
          },
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'copy' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

const CLI_INSTALL_PATH = '/usr/local/bin/livemark';

function getCLISourcePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', 'livemark');
  }
  return path.join(__dirname, '..', '..', 'resources', 'bin', 'livemark');
}

function isCLIInstalled(): boolean {
  try {
    const target = fs.readlinkSync(CLI_INSTALL_PATH);
    return target === getCLISourcePath();
  } catch {
    return false;
  }
}

async function installCLI(): Promise<void> {
  const source = getCLISourcePath();
  try {
    // Try direct symlink first
    if (fs.existsSync(CLI_INSTALL_PATH)) {
      fs.unlinkSync(CLI_INSTALL_PATH);
    }
    fs.symlinkSync(source, CLI_INSTALL_PATH);
    dialog.showMessageBox({
      type: 'info',
      message: 'CLI installed',
      detail: `You can now use "livemark <file>" from the terminal.`,
    });
  } catch {
    // Need elevated permissions — use osascript
    try {
      execSync(
        `osascript -e 'do shell script "ln -sf \\"${source}\\" \\"${CLI_INSTALL_PATH}\\"" with administrator privileges'`
      );
      dialog.showMessageBox({
        type: 'info',
        message: 'CLI installed',
        detail: `You can now use "livemark <file>" from the terminal.`,
      });
    } catch {
      dialog.showErrorBox(
        'CLI installation failed',
        `Could not create symlink at ${CLI_INSTALL_PATH}. You can manually run:\n\nln -s "${source}" ${CLI_INSTALL_PATH}`
      );
    }
  }
}

async function openFileDialog(): Promise<void> {
  if (!mainWindow) return;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    watchFile(result.filePaths[0]);
  }
}

function watchFile(filePath: string): void {
  if (fileWatcher) {
    fileWatcher.close();
  }

  fileWatcher = new FileWatcher(filePath, (content, info) => {
    if (mainWindow) {
      mainWindow.webContents.send('markdown-update', content);
      mainWindow.webContents.send('file-info', info);
      mainWindow.setTitle(`LiveMark - ${path.basename(filePath)}`);
    }
  });
}

// Handle IPC request to open file
ipcMain.on('open-file', () => {
  openFileDialog();
});

// Handle IPC request to open a specific file path (for drag and drop)
ipcMain.on('open-file-path', (_event, filePath: string) => {
  watchFile(filePath);
});

// Parse CLI arguments for file path
function getFileFromArgs(): string | null {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);

  for (const arg of args) {
    if (!arg.startsWith('-') && (arg.endsWith('.md') || arg.endsWith('.markdown') || arg.endsWith('.txt'))) {
      return path.resolve(arg);
    }
  }

  return null;
}

// Track file requested before the app is ready (macOS open-file can fire early)
let pendingFile: string | null = null;

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    watchFile(filePath);
  } else {
    pendingFile = filePath;
  }
});

app.whenReady().then(() => {
  createMenu();
  createWindow();

  // macOS open-file event takes priority, then CLI args
  const filePath = pendingFile ?? getFileFromArgs();
  if (filePath) {
    watchFile(filePath);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (fileWatcher) {
    fileWatcher.close();
  }
});
