import { contextBridge, ipcRenderer } from 'electron';

interface DocumentSnapshot {
  id: string;
  path: string;
  content: string;
  lastModified: number;
}

interface DocumentIdPayload {
  id: string;
}

contextBridge.exposeInMainWorld('livemark', {
  onDocumentUpdate: (callback: (document: DocumentSnapshot) => void) => {
    ipcRenderer.on('document-update', (_event, document: DocumentSnapshot) => {
      callback(document);
    });
  },

  onDocumentActivated: (callback: (payload: DocumentIdPayload) => void) => {
    ipcRenderer.on('document-activated', (_event, payload: DocumentIdPayload) => {
      callback(payload);
    });
  },

  onDocumentClosed: (callback: (payload: DocumentIdPayload) => void) => {
    ipcRenderer.on('document-closed', (_event, payload: DocumentIdPayload) => {
      callback(payload);
    });
  },

  openFile: () => {
    ipcRenderer.send('open-file');
  },

  openFilePaths: (filePaths: string[]) => {
    ipcRenderer.send('open-file-paths', filePaths);
  },

  activateDocument: (documentId: string) => {
    ipcRenderer.send('activate-document', documentId);
  },

  closeDocument: (documentId: string) => {
    ipcRenderer.send('close-document', documentId);
  },
});
