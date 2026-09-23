import markdownit from 'markdown-it';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

const REMOTE_OR_INLINE_SOURCE = /^(https?:\/\/|data:)/i;
export const IMAGE_PLACEHOLDER = 'data:,';

const md = markdownit({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (str: string, lang: string): string => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch {
        // Fall through to default
      }
    }
    return '';
  },
});

// Documents are untrusted: nothing that scripts, restyles, frames or submits may reach the app's DOM.
const SANITIZE_OPTIONS = {
  FORBID_TAGS: ['style', 'form', 'iframe', 'frame', 'object', 'embed', 'meta', 'base', 'link', 'dialog'],
  FORBID_ATTR: ['style', 'target', 'autofocus', 'formaction', 'srcset', 'ping'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

// Local images are resolved through the backend, so they must never be requested from the app origin.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName !== 'IMG') return;
  const source = node.getAttribute('src');
  if (source === null || REMOTE_OR_INLINE_SOURCE.test(source)) return;
  node.setAttribute('data-livemark-source', source);
  node.setAttribute('src', IMAGE_PLACEHOLDER);
});

export function slugify(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'section';
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_OPTIONS);
}

/** Renders Markdown to a detached, sanitised container whose headings all carry unique ids. */
export function renderMarkdown(content: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = sanitizeHtml(md.render(content));
  const usedIds = new Set<string>();
  for (const heading of Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'))) {
    const base = heading.id || slugify(heading.textContent ?? '');
    let id = base;
    for (let suffix = 2; usedIds.has(id); suffix++) {
      id = `${base}-${suffix}`;
    }
    usedIds.add(id);
    heading.id = id;
  }
  // Keep every table inside the reading measure. Column widths share that width.
  for (const table of Array.from(container.querySelectorAll('table'))) {
    if (table.parentElement?.classList.contains('table-scroll')) continue;
    if (table instanceof HTMLTableElement) balanceColumns(table);
    const scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    table.replaceWith(scroll);
    scroll.appendChild(table);
  }
  return container;
}

// Fixed layout needs explicit columns. Each column is sized from its longest word so
// ordinary words stay intact, while one huge token cannot take the whole measure.
const CHAR_PX = 8;
const CELL_PAD = 28;
const WORD_CAP = 24;

function columnWeight(text: string): number {
  const longest = text.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
  return CELL_PAD + Math.min(Math.max(longest, 3), WORD_CAP) * CHAR_PX;
}

function balanceColumns(table: HTMLTableElement): void {
  const rows = Array.from(table.rows);
  const count = rows.reduce((widest, row) => Math.max(widest, row.cells.length), 0);
  if (count < 2) return;
  if (rows.some((row) => Array.from(row.cells).some((cell) => cell.colSpan > 1 || cell.rowSpan > 1))) return;

  const weights = Array.from({ length: count }, () => columnWeight(''));
  for (const row of rows) {
    for (let index = 0; index < count; index += 1) {
      weights[index] = Math.max(weights[index], columnWeight(row.cells[index]?.textContent?.trim() ?? ''));
    }
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const group = document.createElement('colgroup');
  for (const weight of weights) {
    const col = document.createElement('col');
    col.style.width = `${(weight / total) * 100}%`;
    group.appendChild(col);
  }
  table.prepend(group);
}

// Compact content fingerprint (cyrb53) so block identity does not mean keeping every block's HTML around twice.
export function blockKey(element: Element): string {
  const text = element.outerHTML;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function tableElement(block: Element): Element | null {
  if (block.tagName === 'TABLE') return block;
  if (block.classList.contains('table-scroll')) return block.querySelector(':scope > table');
  return null;
}

/** Table rows and list items can be marked individually when only some of them changed. */
export function changeableItems(block: Element): Element[] {
  const table = tableElement(block);
  if (table) return Array.from(table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr'));
  if (block.tagName === 'UL' || block.tagName === 'OL') return Array.from(block.querySelectorAll(':scope > li'));
  return [];
}

export function isLocalImageSource(source: string | null | undefined): source is string {
  return !!source && !REMOTE_OR_INLINE_SOURCE.test(source) && !source.startsWith('//');
}
