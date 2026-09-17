import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';

export interface DocumentSnapshot {
  id: string;
  path: string;
  content: string;
  lastModified: number;
}

export interface DocumentIdPayload {
  id: string;
}

export interface OpenFailedPayload {
  path: string;
  error: string;
}

export interface ResolvedImage {
  modified: number;
  /** Null when the image has not changed since `knownModified`. */
  dataUrl: string | null;
}

export interface DocumentRelocatedPayload {
  fromId: string;
  toId: string;
}

export interface BootstrapState {
  documents: DocumentSnapshot[];
  activeDocumentId: string | null;
  missingDocumentIds: string[];
  version: string;
}

export interface LiveMarkBridge {
  onDocumentUpdate(callback: (document: DocumentSnapshot) => void): void;
  onDocumentActivated(callback: (payload: DocumentIdPayload) => void): void;
  onDocumentClosed(callback: (payload: DocumentIdPayload) => void): void;
  onDocumentMissing(callback: (payload: DocumentIdPayload) => void): void;
  onDocumentRestored(callback: (payload: DocumentIdPayload) => void): void;
  onDocumentRelocated(callback: (payload: DocumentRelocatedPayload) => void): void;
  onMenuCommand(callback: (command: string) => void): void;
  onOpenFailed(callback: (payload: OpenFailedPayload) => void): void;
  onFileDrop(callback: (filePaths: string[]) => void): void;
  bootstrap(): Promise<BootstrapState>;
  openFile(): Promise<void>;
  openFilePaths(filePaths: string[]): Promise<void>;
  activateDocument(documentId: string): Promise<void>;
  closeDocument(documentId: string): Promise<void>;
  resolveLocalImage(documentId: string, source: string, knownModified?: number): Promise<ResolvedImage>;
  openLink(documentId: string, href: string): Promise<void>;
  locateDocument(documentId: string): Promise<void>;
  listSiblingDocuments(): Promise<string[]>;
}

export function installLiveMarkBridge(): LiveMarkBridge {
  const registrations: Promise<UnlistenFn>[] = [];

  const register = <T>(eventName: string, callback: (payload: T) => void): void => {
    registrations.push(listen<T>(eventName, (event) => callback(event.payload)));
  };

  const bridge: LiveMarkBridge = {
    onDocumentUpdate: (callback) => register('document-update', callback),
    onDocumentActivated: (callback) => register('document-activated', callback),
    onDocumentClosed: (callback) => register('document-closed', callback),
    onDocumentMissing: (callback) => register('document-missing', callback),
    onDocumentRestored: (callback) => register('document-restored', callback),
    onDocumentRelocated: (callback) => register('document-relocated', callback),
    onMenuCommand: (callback) => register('menu-command', callback),
    onOpenFailed: (callback) => register('open-failed', callback),
    onFileDrop: (callback) => {
      registrations.push(
        getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === 'drop') {
            callback(event.payload.paths);
          }
        })
      );
    },
    bootstrap: async () => {
      await Promise.all(registrations);
      return invoke<BootstrapState>('bootstrap');
    },
    openFile: () => invoke<void>('open_file_dialog'),
    openFilePaths: (filePaths) => invoke<void>('open_file_paths', { filePaths }),
    activateDocument: (documentId) => invoke<void>('activate_document', { documentId }),
    closeDocument: (documentId) => invoke<void>('close_document', { documentId }),
    resolveLocalImage: (documentId, source, knownModified) =>
      invoke<ResolvedImage>('resolve_local_image', { documentId, source, knownModified }),
    openLink: (documentId, href) => invoke<void>('open_link', { documentId, href }),
    locateDocument: (documentId) => invoke<void>('locate_document', { documentId }),
    listSiblingDocuments: () => invoke<string[]>('list_sibling_documents'),
  };

  window.livemark = bridge;
  return bridge;
}
