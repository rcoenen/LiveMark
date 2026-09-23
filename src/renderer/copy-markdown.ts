import TurndownService from 'turndown';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

// Copied Markdown refers to local images by their original path, not by the data URL they are displayed with.
turndown.addRule('localImage', {
  filter: (node) => node.nodeName === 'IMG' && node.hasAttribute('data-livemark-source'),
  replacement: (_content, node) => {
    const image = node as HTMLElement;
    const source = image.getAttribute('data-livemark-source') ?? '';
    return `![${image.getAttribute('alt') ?? ''}](${/\s/.test(source) ? `<${source}>` : source})`;
  },
});

// Google Docs "Paste from Markdown" builds a table only from the separator it exports itself (`| :---- |`).
// A plain `|---|` row stays ordinary text, so every copied table uses the Docs form.
turndown.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows = Array.from((node as HTMLTableElement).rows);
    if (rows.length === 0) return '';
    const width = Math.max(...rows.map((row) => row.cells.length));
    const line = (row: HTMLTableRowElement): string => {
      const cells: string[] = [];
      for (let index = 0; index < width; index += 1) {
        cells.push(cellMarkdown(row.cells[index]));
      }
      return `| ${cells.join(' | ')} |`;
    };
    const separator = `| ${Array.from({ length: width }, (_, index) => columnAlign(rows[0].cells[index])).join(' | ')} |`;
    return `\n\n${[line(rows[0]), separator, ...rows.slice(1).map(line)].join('\n')}\n\n`;
  },
});

function cellMarkdown(cell: HTMLTableCellElement | undefined): string {
  const html = cell?.innerHTML.trim() ?? '';
  if (!html) return '';
  return turndown.turndown(html).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

function columnAlign(cell: HTMLTableCellElement | undefined): string {
  const align = `${cell?.getAttribute('align') ?? ''} ${cell?.style.textAlign ?? ''}`.toLowerCase();
  if (align.includes('center')) return ':----:';
  if (align.includes('right')) return '----:';
  return ':----';
}

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const SEPARATOR_CELL = /^\s*:?-{3,}:?\s*$/;

/** Rewrites GFM separator rows to the Google Docs form, leaving every other line untouched. */
export function googleDocsTables(markdown: string): string {
  const lines = markdown.split('\n');
  let fence: { char: string; length: number } | null = null;
  return lines.map((line) => {
    const match = FENCE.exec(line);
    if (match) {
      const marker = match[2];
      const char = marker[0];
      if (!fence) {
        fence = { char, length: marker.length };
      } else if (char === fence.char && marker.length >= fence.length && line.trim() === marker) {
        fence = null;
      }
      return line;
    }
    return fence ? line : rewriteSeparator(line);
  }).join('\n');
}

function rewriteSeparator(line: string): string {
  const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
  const trimmed = line.slice(indent.length).trimEnd();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return line;
  const cells = trimmed.slice(1, -1).split('|');
  if (cells.length === 0 || cells.some((cell) => !SEPARATOR_CELL.test(cell))) return line;
  const markers = cells.map((cell) => {
    const compact = cell.trim();
    const left = compact.startsWith(':');
    const right = compact.endsWith(':');
    if (left && right) return ':----:';
    if (right && !left) return '----:';
    return ':----';
  });
  return `${indent}| ${markers.join(' | ')} |`;
}

/** Converts a rendered selection back to Markdown, with tables in the Google Docs form. */
export function htmlToMarkdown(html: string): string {
  return googleDocsTables(turndown.turndown(html));
}

/** True when the range includes every text node of the rendered document. Select All does this. */
export function selectionCoversElement(range: Range, element: HTMLElement): boolean {
  if (range.commonAncestorContainer !== element && !element.contains(range.commonAncestorContainer)) return false;
  const selected = range.toString().replace(/\s+/g, '');
  const whole = (element.textContent ?? '').replace(/\s+/g, '');
  return whole.length > 0 && selected === whole;
}

/**
 * Select All and a copy with no selection both put the document Markdown on the clipboard.
 * A smaller selection is converted back to Markdown so only that portion is copied.
 */
export function markdownForCopy(source: string, selectionHtml: string | null, coversDocument: boolean): string {
  if (selectionHtml === null || coversDocument) return googleDocsTables(source);
  return htmlToMarkdown(selectionHtml);
}
