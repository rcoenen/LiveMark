declare module 'markdown-it' {
  interface MarkdownItOptions {
    html?: boolean;
    xhtmlOut?: boolean;
    breaks?: boolean;
    langPrefix?: string;
    linkify?: boolean;
    typographer?: boolean;
    highlight?: (str: string, lang: string) => string;
  }

  interface MarkdownIt {
    render(md: string): string;
  }

  function markdownit(options?: MarkdownItOptions): MarkdownIt;
  export = markdownit;
}

interface Window {
  livemark: {
    onMarkdownUpdate: (callback: (content: string) => void) => void;
    onFileInfo: (callback: (info: { path: string; lastModified: Date }) => void) => void;
    openFile: () => void;
    openFilePath: (filePath: string) => void;
  };
}
