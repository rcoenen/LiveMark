import { contextBridge, ipcRenderer } from 'electron';

interface FileInfo {
  path: string;
  lastModified: Date;
}

contextBridge.exposeInMainWorld('livemark', {
  onMarkdownUpdate: (callback: (content: string) => void) => {
    ipcRenderer.on('markdown-update', (_event, content: string) => {
      callback(content);
    });
  },

  onFileInfo: (callback: (info: FileInfo) => void) => {
    ipcRenderer.on('file-info', (_event, info: FileInfo) => {
      callback(info);
    });
  },

  openFile: () => {
    ipcRenderer.send('open-file');
  },

  openFilePath: (filePath: string) => {
    ipcRenderer.send('open-file-path', filePath);
  },
});
