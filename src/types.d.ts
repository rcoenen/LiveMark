declare module 'markdown-it' {
  interface Token {
    attrGet(name: string): string | null;
    attrSet(name: string, value: string): void;
  }

  interface Renderer {
    rules: Record<string, RuleFn>;
    renderToken: (tokens: Token[], idx: number, options: MarkdownItOptions) => string;
  }

  type RuleFn = (tokens: Token[], idx: number, options: MarkdownItOptions, env: unknown, self: Renderer) => string;

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
    render(md: string, env?: unknown): string;
    renderer: Renderer;
  }

  function markdownit(options?: MarkdownItOptions): MarkdownIt;
  export = markdownit;
}

interface Window {
  livemark: import('./renderer/platform').LiveMarkBridge;
}
