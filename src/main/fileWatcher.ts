import * as fs from 'fs';
import * as chokidar from 'chokidar';

export interface FileInfo {
  path: string;
  lastModified: Date;
}

type UpdateCallback = (content: string, info: FileInfo) => void;

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private filePath: string;
  private callback: UpdateCallback;

  constructor(filePath: string, callback: UpdateCallback) {
    this.filePath = filePath;
    this.callback = callback;
    this.start();
  }

  private start(): void {
    // Initial read
    this.readAndNotify();

    // Watch for changes
    this.watcher = chokidar.watch(this.filePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('change', () => {
      this.readAndNotify();
    });

    this.watcher.on('error', (error) => {
      console.error('File watcher error:', error);
    });
  }

  private readAndNotify(): void {
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const stats = fs.statSync(this.filePath);

      const info: FileInfo = {
        path: this.filePath,
        lastModified: stats.mtime,
      };

      this.callback(content, info);
    } catch (error) {
      console.error('Error reading file:', error);
    }
  }

  public close(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
