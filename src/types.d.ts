declare module 'markdown-it' {
  interface Token {
    type: string;
    tag: string;
    level: number;
    map: [number, number] | null;
    content: string;
    children: Token[] | null;
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
    parse(md: string, env: unknown): Token[];
    parseInline(md: string, env: unknown): Token[];
    renderer: Renderer;
  }

  function markdownit(options?: MarkdownItOptions): MarkdownIt;
  export = markdownit;
}

interface Window {
  livemark: import('./renderer/platform').LiveMarkBridge;
}

declare module '*?raw' {
  const content: string;
  export default content;
}
