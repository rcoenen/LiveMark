import { app, BrowserWindow, dialog, Menu, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { FileWatcher } from './fileWatcher';

interface DocumentSnapshot {
  id: string;
  path: string;
  content: string;
  lastModified: number;
}

interface DocumentRecord {
  id: string;
  path: string;
  watcher: FileWatcher;
  latest: DocumentSnapshot | null;
}

interface DocumentIdPayload {
  id: string;
}

// Set app name for development mode
app.setName('LiveMark');

// Set About panel options
app.setAboutPanelOptions({
  applicationName: 'LiveMark',
  applicationVersion: '1.3.1', // x-release-please-version
  version: '1.3.1', // x-release-please-version
  copyright: 'Live-updating Markdown viewer for macOS',
});

let mainWindow: BrowserWindow | null = null;
let rendererLoaded = false;
let activeDocumentId: string | null = null;
const documents = new Map<string, DocumentRecord>();
const pendingFiles: string[] = [];

function sendToRenderer(channel: string, payload: unknown): void {
  if (!mainWindow || !rendererLoaded || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function replayDocuments(): void {
  for (const document of documents.values()) {
    if (document.latest) {
      sendToRenderer('document-update', document.latest);
    }
  }

  if (activeDocumentId) {
    sendToRenderer('document-activated', { id: activeDocumentId } satisfies DocumentIdPayload);
  }
}

function createWindow(): void {
  rendererLoaded = false;
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

  mainWindow.webContents.on('did-start-loading', () => {
    rendererLoaded = false;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    rendererLoaded = true;
    replayDocuments();
  });

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererLoaded = false;
    closeAllDocuments();
  });
}

function ensureWindow(): BrowserWindow {
  if (!mainWindow) {
    createWindow();
  }

  return mainWindow as BrowserWindow;
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
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => closeActiveDocument(),
        },
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => mainWindow?.close(),
        },
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
      detail: 'You can now use "livemark <file> [file...]" from the terminal.',
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
        detail: 'You can now use "livemark <file> [file...]" from the terminal.',
      });
    } catch {
      dialog.showErrorBox(
        'CLI installation failed',
        `Could not create symlink at ${CLI_INSTALL_PATH}. You can manually run:\n\nln -s "${source}" ${CLI_INSTALL_PATH}`
      );
    }
  }
}

function canonicalizeFilePath(filePath: string): string | null {
  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.statSync(resolvedPath).isFile()) return null;
    return fs.realpathSync.native(resolvedPath);
  } catch (error) {
    console.error(`Could not open file: ${filePath}`, error);
    return null;
  }
}

function setActiveDocument(documentId: string): void {
  const document = documents.get(documentId);
  if (!document) return;

  activeDocumentId = documentId;
  mainWindow?.setTitle(`LiveMark - ${path.basename(document.path)}`);
  sendToRenderer('document-activated', { id: documentId } satisfies DocumentIdPayload);
}

function openDocument(filePath: string): void {
  const canonicalPath = canonicalizeFilePath(filePath);
  if (!canonicalPath) return;

  const existingDocument = documents.get(canonicalPath);
  if (existingDocument) {
    setActiveDocument(existingDocument.id);
    mainWindow?.show();
    mainWindow?.focus();
    return;
  }

  let latestSnapshot: DocumentSnapshot | null = null;
  const watcher = new FileWatcher(canonicalPath, (content, info) => {
    const snapshot: DocumentSnapshot = {
      id: canonicalPath,
      path: info.path,
      content,
      lastModified: info.lastModified.getTime(),
    };
    latestSnapshot = snapshot;

    const document = documents.get(canonicalPath);
    if (document) {
      document.latest = snapshot;
      sendToRenderer('document-update', snapshot);
    }
  });

  documents.set(canonicalPath, {
    id: canonicalPath,
    path: canonicalPath,
    watcher,
    latest: latestSnapshot,
  });

  if (latestSnapshot) {
    sendToRenderer('document-update', latestSnapshot);
  }
  setActiveDocument(canonicalPath);
  mainWindow?.show();
  mainWindow?.focus();
}

function openDocuments(filePaths: string[]): void {
  ensureWindow();
  for (const filePath of filePaths) {
    openDocument(filePath);
  }
}

function closeDocument(documentId: string): void {
  const documentIds = Array.from(documents.keys());
  const closingIndex = documentIds.indexOf(documentId);
  const document = documents.get(documentId);
  if (!document || closingIndex < 0) return;

  document.watcher.close();
  documents.delete(documentId);
  sendToRenderer('document-closed', { id: documentId } satisfies DocumentIdPayload);

  if (activeDocumentId !== documentId) return;

  const remainingIds = Array.from(documents.keys());
  const adjacentId = remainingIds[Math.min(closingIndex, remainingIds.length - 1)] ?? null;
  activeDocumentId = null;

  if (adjacentId) {
    setActiveDocument(adjacentId);
  } else {
    mainWindow?.setTitle('LiveMark');
  }
}

function closeActiveDocument(): void {
  if (activeDocumentId) {
    closeDocument(activeDocumentId);
  } else {
    mainWindow?.close();
  }
}

function closeAllDocuments(): void {
  for (const document of documents.values()) {
    document.watcher.close();
  }
  documents.clear();
  activeDocumentId = null;
}

async function openFileDialog(): Promise<void> {
  const window = ensureWindow();
  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled) {
    openDocuments(result.filePaths);
  }
}

ipcMain.on('open-file', () => {
  void openFileDialog();
});

ipcMain.on('open-file-paths', (_event, filePaths: unknown) => {
  if (!Array.isArray(filePaths)) return;
  openDocuments(filePaths.filter((filePath): filePath is string => typeof filePath === 'string'));
});

ipcMain.on('activate-document', (_event, documentId: unknown) => {
  if (typeof documentId === 'string') {
    setActiveDocument(documentId);
  }
});

ipcMain.on('close-document', (_event, documentId: unknown) => {
  if (typeof documentId === 'string') {
    closeDocument(documentId);
  }
});

function getFilesFromArgs(): string[] {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  return args
    .filter((arg) => {
      const extension = path.extname(arg).toLowerCase();
      return !arg.startsWith('-') && ['.md', '.markdown', '.txt'].includes(extension);
    })
    .map((arg) => path.resolve(arg));
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();

  if (!app.isReady()) {
    pendingFiles.push(filePath);
    return;
  }

  openDocuments([filePath]);
});

app.whenReady().then(() => {
  createMenu();
  ensureWindow();

  const startupFiles = [...pendingFiles, ...getFilesFromArgs()];
  pendingFiles.length = 0;
  openDocuments(startupFiles);

  app.on('activate', () => {
    ensureWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  closeAllDocuments();
});
