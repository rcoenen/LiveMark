import { SOURCE_ATTR, renderFragment } from '../markdown';

/**
 * Mapping between the rendered document and its Markdown source. Paragraphs and headings carry their source
 * range. A mapping is accepted only when re-rendering the block with marker characters at the source offsets
 * puts the markers exactly around the same rendered text, so the real parser is the judge, not a text search.
 */
const MARK_START = '';
const MARK_END = '';

export interface SourceBlock {
  element: HTMLElement;
  start: number;
  end: number;
}

export type SelectionResult =
  | { ok: true; start: number; end: number }
  | { ok: false; reason: string };

export function sourceBlockOf(node: Node | null, root: HTMLElement): SourceBlock | null {
  const element = (node instanceof Element ? node : node?.parentElement)?.closest(`[${SOURCE_ATTR}]`);
  if (!(element instanceof HTMLElement) || !root.contains(element)) return null;
  return readBlock(element);
}

function readBlock(element: HTMLElement): SourceBlock | null {
  const match = /^(\d+):(\d+)$/.exec(element.getAttribute(SOURCE_ATTR) ?? '');
  if (!match) return null;
  return { element, start: Number(match[1]), end: Number(match[2]) };
}

export function sourceBlocks(root: HTMLElement): SourceBlock[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`[${SOURCE_ATTR}]`))
    .map(readBlock)
    .filter((block): block is SourceBlock => block !== null);
}

/** Rendered text offsets of the source range `[start, end)` inside one block, or null when it cannot be shown. */
export function renderedRange(block: SourceBlock, body: string, start: number, end: number): { start: number; end: number } | null {
  if (start < block.start || end > block.end || start >= end) return null;
  const source = body.substring(block.start, block.end);
  if (source.includes(MARK_START) || source.includes(MARK_END)) return null;
  const local = { start: start - block.start, end: end - block.start };
  const marked = source.substring(0, local.start) + MARK_START + source.substring(local.start, local.end) + MARK_END + source.substring(local.end);
  const fragment = renderFragment(marked);
  // The block re-rendered on its own; a tight list item's paragraph is a span in both renders.
  const twin = fragment.querySelector(block.element.tagName.toLowerCase());
  if (!twin) return null;
  const text = twin.textContent ?? '';
  const first = text.indexOf(MARK_START);
  const second = text.indexOf(MARK_END);
  if (first < 0 || second < first || text.indexOf(MARK_START, first + 1) >= 0) return null;
  const clean = text.replace(MARK_START, '').replace(MARK_END, '');
  // A marker next to a quote can change which way the typographer curls it; that never moves text.
  const quotes = (value: string): string => value.replace(/[\u2018\u2019']/g, "'").replace(/[\u201c\u201d"]/g, '"');
  if (quotes(clean) !== quotes(block.element.textContent ?? '')) return null;
  return { start: first, end: second - 1 };
}

/** Source characters the rendered page never shows: link targets, images, HTML tags and line markup. */
function hiddenSourceMask(source: string): Uint8Array {
  const hidden = new Uint8Array(source.length);
  const hide = (pattern: RegExp, group = 0): void => {
    for (const match of source.matchAll(pattern)) {
      const offset = (match.index ?? 0) + (group ? match[0].indexOf(match[group]) : 0);
      hidden.fill(1, offset, offset + match[group].length);
    }
  };
  hide(/!\[[^\]]*\]\([^)]*\)/g);
  hide(/\]\(([^)]*)\)/g);
  hide(/\]\[[^\]]*\]/g);
  hide(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^>]*)?\/?>/g);
  return hidden;
}

const TYPOGRAPHIC: Array<[string, string]> = [
  ['---', '—'], ['--', '–'], ['...', '…'], ['(c)', '©'], ['(C)', '©'], ['(r)', '®'],
  ['(R)', '®'], ['(tm)', '™'], ['(TM)', '™'], ['+-', '±'],
];
const QUOTES: Record<string, string> = { '“': '"', '”': '"', '‘': "'", '’': "'" };

let decoder: HTMLTextAreaElement | null = null;
function decodeEntity(entity: string): string {
  decoder ??= document.createElement('textarea');
  decoder.innerHTML = entity;
  return decoder.value;
}

/**
 * For each rendered character, the source span it came from. Markup is skipped; escapes, entities and the
 * typographer's replacements are matched to their source spelling. Returns null when the two do not line up.
 */
export function alignBlock(source: string, rendered: string): Array<[number, number]> | null {
  const hidden = hiddenSourceMask(source);
  const spans: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (j < rendered.length) {
    if (i >= source.length) return null;
    const r = rendered[j];
    if (hidden[i]) {
      i++;
      continue;
    }
    if (source[i] === r) {
      spans.push([i, i + 1]);
      i++;
      j++;
      continue;
    }
    if (source[i] === '\\' && source[i + 1] === r) {
      spans.push([i, i + 2]);
      i += 2;
      j++;
      continue;
    }
    const entity = /^&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.exec(source.substring(i, i + 40));
    if (entity) {
      const decoded = decodeEntity(entity[0]);
      if (decoded && rendered.startsWith(decoded, j)) {
        for (let k = 0; k < decoded.length; k++) spans.push([i, i + entity[0].length]);
        i += entity[0].length;
        j += decoded.length;
        continue;
      }
    }
    const typographic = TYPOGRAPHIC.find(([from, to]) => to === r && source.startsWith(from, i));
    if (typographic) {
      spans.push([i, i + typographic[0].length]);
      i += typographic[0].length;
      j++;
      continue;
    }
    if (QUOTES[r] === source[i]) {
      spans.push([i, i + 1]);
      i++;
      j++;
      continue;
    }
    i++;
  }
  return spans;
}

const FORMATTING = new Set(['STRONG', 'EM', 'DEL', 'S', 'A']);
const UNSUPPORTED = 'code, img, kbd, samp, sup, sub, mark:not(.lm-comment):not(.lm-find), input, br';

function textOffset(block: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(block, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

function isGraphemeBoundary(text: string, offset: number): boolean {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => { segment(text: string): Iterable<{ index: number }> } }).Segmenter;
  if (!Segmenter || offset === 0 || offset === text.length) return true;
  for (const segment of new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    if (segment.index === offset) return true;
    if (segment.index > offset) return false;
  }
  return false;
}

/** Whether a fully selected formatting element starts or ends exactly at a selection boundary. */
function coveredFormattingAt(block: HTMLElement, range: Range, edge: 'start' | 'end', selection: { start: number; end: number }): boolean {
  for (const element of Array.from(block.querySelectorAll<HTMLElement>('strong, em, del, s, a'))) {
    if (!FORMATTING.has(element.tagName)) continue;
    const from = textOffset(block, element, 0);
    const to = from + (element.textContent ?? '').length;
    if (from < selection.start || to > selection.end || !range.intersectsNode(element)) continue;
    if (edge === 'start' ? from === selection.start : to === selection.end) return true;
  }
  return false;
}

/** Maps a selection in the rendered document to a UTF-16 source range of `body`, or explains why it cannot. */
export function sourceRangeForSelection(range: Range, root: HTMLElement, body: string): SelectionResult {
  if (range.collapsed) return { ok: false, reason: 'Select some text first.' };
  if (range.startContainer.parentElement?.closest('pre, code') || range.endContainer.parentElement?.closest('pre, code')) {
    return { ok: false, reason: 'Comments cannot be anchored in code, images or line breaks yet.' };
  }
  const block = sourceBlockOf(range.startContainer, root);
  const endBlock = sourceBlockOf(range.endContainer, root);
  if (!block || !endBlock || block.element !== endBlock.element) {
    return { ok: false, reason: 'Select text within one paragraph, heading or list item.' };
  }
  const fragment = range.cloneContents();
  if (fragment.querySelector(UNSUPPORTED) || range.startContainer.parentElement?.closest('code') || range.endContainer.parentElement?.closest('code')) {
    return { ok: false, reason: 'Comments cannot be anchored in code, images or line breaks yet.' };
  }
  if (block.element.querySelector('table')) return { ok: false, reason: 'Comments cannot be anchored in tables yet.' };

  const rendered = block.element.textContent ?? '';
  const selection = {
    start: textOffset(block.element, range.startContainer, range.startOffset),
    end: textOffset(block.element, range.endContainer, range.endOffset),
  };
  // Leading and trailing white space in a selection is not meaningful to anchor.
  while (selection.start < selection.end && /\s/.test(rendered[selection.start])) selection.start++;
  while (selection.end > selection.start && /\s/.test(rendered[selection.end - 1])) selection.end--;
  if (selection.start >= selection.end) return { ok: false, reason: 'Select some text first.' };
  if (!isGraphemeBoundary(rendered, selection.start) || !isGraphemeBoundary(rendered, selection.end)) {
    return { ok: false, reason: 'The selection splits a character.' };
  }

  const source = body.substring(block.start, block.end);
  const spans = alignBlock(source, rendered);
  const failed: SelectionResult = { ok: false, reason: 'This selection cannot be matched to the Markdown source.' };
  if (!spans) return failed;
  let start = spans[selection.start][0];
  let end = spans[selection.end - 1][1];

  const candidates: Array<[number, number]> = [];
  // A fully selected bold, italic, struck or linked node takes its Markdown delimiters along.
  let wideStart = start;
  let wideEnd = end;
  if (coveredFormattingAt(block.element, range, 'start', selection)) {
    while (wideStart > 0 && /[*_~[]/.test(source[wideStart - 1])) wideStart--;
  }
  if (coveredFormattingAt(block.element, range, 'end', selection)) {
    while (wideEnd < source.length && /[*_~]/.test(source[wideEnd])) wideEnd++;
    const link = /^\](?:\([^)]*\)|\[[^\]]*\])/.exec(source.substring(wideEnd));
    if (link) wideEnd += link[0].length;
  }
  if (wideStart !== start || wideEnd !== end) candidates.push([wideStart, wideEnd]);
  candidates.push([start, end]);

  for ([start, end] of candidates) {
    const check = renderedRange(block, body, block.start + start, block.start + end);
    if (check && check.start === selection.start && check.end === selection.end) {
      return { ok: true, start: block.start + start, end: block.start + end };
    }
  }
  return failed;
}

/** Wraps the given rendered-text intervals of one block in highlight marks, one mark per text segment. */
export function highlightBlock(block: HTMLElement, intervals: Array<{ start: number; end: number; id: string }>): void {
  if (intervals.length === 0) return;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  let offset = 0;
  for (const node of nodes) {
    const length = node.data.length;
    const nodeStart = offset;
    offset += length;
    const cuts = new Set<number>([0, length]);
    for (const interval of intervals) {
      if (interval.end <= nodeStart || interval.start >= nodeStart + length) continue;
      cuts.add(Math.max(0, interval.start - nodeStart));
      cuts.add(Math.min(length, interval.end - nodeStart));
    }
    const points = Array.from(cuts).sort((a, b) => a - b);
    if (points.length === 2 && !intervals.some((interval) => interval.start < nodeStart + length && interval.end > nodeStart)) continue;
    const fragment = document.createDocumentFragment();
    for (let k = 0; k < points.length - 1; k++) {
      const from = points[k];
      const to = points[k + 1];
      if (from === to) continue;
      const piece = document.createTextNode(node.data.substring(from, to));
      const ids = intervals.filter((interval) => interval.start < nodeStart + to && interval.end > nodeStart + from).map((interval) => interval.id);
      if (ids.length === 0) {
        fragment.appendChild(piece);
        continue;
      }
      const mark = document.createElement('mark');
      mark.className = 'lm-comment';
      mark.dataset.threads = ids.join(' ');
      if (ids.length > 1) mark.classList.add('is-shared');
      mark.appendChild(piece);
      fragment.appendChild(mark);
    }
    node.replaceWith(fragment);
  }
}

export function clearHighlights(root: HTMLElement): void {
  for (const mark of Array.from(root.querySelectorAll('mark.lm-comment'))) {
    const parent = mark.parentNode;
    mark.replaceWith(...Array.from(mark.childNodes));
    parent?.normalize();
  }
}
