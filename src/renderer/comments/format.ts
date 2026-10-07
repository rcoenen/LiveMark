import { parseBlocks } from '../markdown';
import { JsonError, clone, get, getString, jarr, jnull, jnum, jobj, jstr, parseJson, set, stringifyJson, type JsonObject, type JsonValue } from './json';
import { sha256Hex } from './sha256';

/**
 * The LiveMark comment footer (format "livemark-comments", version 1): one JSON block in an HTML comment
 * at the very end of the file. Everything before it is the document body and is never rewritten.
 */
export const OPENER = '<!--livemark:comments';
export const CLOSER = '-->';
/** Above these, the raw block is kept and comments become read-only rather than truncated. */
export const MAX_METADATA_BYTES = 4 * 1024 * 1024;
export const MAX_THREADS = 5000;
const CONTEXT_CODE_POINTS = 32;

export type Eol = '\n' | '\r\n';
export type AnchorState = 'attached' | 'orphaned';

export interface AnchorData {
  state: AnchorState;
  start: number | null;
  end: number | null;
  exact: string;
  prefix: string;
  suffix: string;
}

export interface MessageView {
  json: JsonObject;
  id: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt?: string;
  content: string;
}

export interface ThreadView {
  json: JsonObject;
  id: string;
  status: 'open' | 'resolved';
  anchor: AnchorData;
  messages: MessageView[];
}

export interface Envelope {
  /** Index in the file where the two separator line endings start; the body is everything before it. */
  start: number;
  eol: Eol;
  raw: string;
}

export type ReviewParse =
  | { kind: 'none'; body: string; eol: Eol }
  | { kind: 'ok'; body: string; eol: Eol; envelope: Envelope; root: JsonObject; threads: ThreadView[]; digestMatches: boolean }
  | { kind: 'readonly'; body: string; eol: Eol; reason: string; repair?: string };

export function prevailingEol(text: string): Eol {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  return crlf > lf ? '\r\n' : '\n';
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

const isReservedBlock = (content: string): boolean => /^ {0,3}<!--livemark:comments/.test(content);

/** Finds the owned footer using the Markdown parser, so marker text inside code or other blocks is ordinary content. */
export function parseReview(text: string): ReviewParse {
  const blocks = parseBlocks(text);
  const reserved = blocks.filter((token) => token.level === 0 && token.type === 'html_block' && isReservedBlock(token.content));
  if (reserved.length === 0) return { kind: 'none', body: text, eol: prevailingEol(text) };
  const readonly = (reason: string, body = text): ReviewParse => ({ kind: 'readonly', body, eol: prevailingEol(body), reason });
  if (reserved.length > 1) return readonly('This file has more than one comment block.');

  const token = reserved[0];
  const topLevel = blocks.filter((candidate) => candidate.level === 0 && candidate.map);
  if (topLevel[topLevel.length - 1] !== token || !token.map) {
    return { kind: 'readonly', body: text, eol: prevailingEol(text), reason: 'Text was added after the comment block.', repair: moveFooterToEnd(text, token.map) };
  }
  const offset = lineStarts(text)[token.map[0]];
  if (!text.startsWith(OPENER, offset)) return readonly('The comment block must start at the beginning of a line.');

  const before = /(\r?\n)(\r?\n)$/.exec(text.substring(0, offset));
  if (!before) return readonly('The comment block must follow an empty line.');
  const tail = /^<!--livemark:comments(\r?\n)([\s\S]*?)\r?\n-->(\r?\n)?$/.exec(text.substring(offset));
  if (!tail || tail[2].includes(CLOSER)) return readonly('The comment block is malformed.');

  const start = offset - before[0].length;
  const body = text.substring(0, start);
  const eol = tail[1] as Eol;
  const envelope: Envelope = { start, eol, raw: text.substring(start) };
  const json = tail[2];
  if (new TextEncoder().encode(json).length > MAX_METADATA_BYTES) return readonly('The comment block is larger than LiveMark supports.', body);

  let root: JsonValue;
  try {
    root = parseJson(json);
  } catch (error) {
    return readonly(`The comment block is not valid JSON: ${error instanceof JsonError ? error.message : String(error)}.`, body);
  }
  const validated = validateRoot(root, body);
  if (typeof validated === 'string') return readonly(validated, body);
  return { kind: 'ok', body, eol, envelope, root: validated.root, threads: validated.threads, digestMatches: validated.digestMatches };
}

/**
 * Another tool appended text after the footer. The fix keeps every document character in order and only moves
 * the comment block back to the end; it is offered, never applied silently.
 */
function moveFooterToEnd(text: string, map: [number, number] | null): string | undefined {
  if (!map) return undefined;
  const starts = lineStarts(text);
  const blockStart = starts[map[0]];
  const blockEnd = map[1] < starts.length ? starts[map[1]] : text.length;
  const before = text.substring(0, blockStart).replace(/\r?\n\r?\n$/, '');
  const block = text.substring(blockStart, blockEnd).replace(/\r?\n$/, '');
  const body = before + text.substring(blockEnd);
  const eol = prevailingEol(body);
  const repaired = `${body}${eol}${eol}${block}${eol}`;
  const check = parseReview(repaired);
  return check.kind === 'ok' && check.body === body ? repaired : undefined;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const isDate = (value: string): boolean => RFC3339_UTC.test(value) && !Number.isNaN(Date.parse(value));

function readOffset(value: JsonValue | undefined): number | null | undefined {
  if (value?.t === 'null') return null;
  if (value?.t !== 'num' || !/^\d+$/.test(value.raw)) return undefined;
  const number = Number(value.raw);
  return Number.isSafeInteger(number) ? number : undefined;
}

/** Validates the schema; returns a reason string when the data must stay read-only. */
export function validateRoot(root: JsonValue, body: string): string | { root: JsonObject; threads: ThreadView[]; digestMatches: boolean } {
  if (root.t !== 'obj') return 'The comment block is not a JSON object.';
  if (getString(root, 'format') !== 'livemark-comments') return 'The comment block has an unknown format.';
  const version = get(root, 'version');
  if (version?.t !== 'num' || version.raw !== '1') return 'This comment block was written by a newer version of LiveMark.';
  if (getString(root, 'offsetUnit') !== 'utf16') return 'The comment block uses an unsupported offset unit.';
  const digest = getString(root, 'bodySha256');
  if (!digest || !/^[0-9a-f]{64}$/.test(digest)) return 'The comment block has an invalid body digest.';
  const threadsValue = get(root, 'threads');
  if (threadsValue?.t !== 'arr') return 'The comment block has no thread list.';
  if (threadsValue.items.length > MAX_THREADS) return 'The comment block has more threads than LiveMark supports.';

  const digestMatches = digest === sha256Hex(body);
  const threadIds = new Set<string>();
  const messageIds = new Set<string>();
  const threads: ThreadView[] = [];
  for (const [index, item] of threadsValue.items.entries()) {
    const where = `Thread ${index + 1}`;
    if (item.t !== 'obj') return `${where} is not an object.`;
    const id = getString(item, 'id');
    if (!id || !ID.test(id)) return `${where} has an invalid id.`;
    if (threadIds.has(id)) return `Thread id ${id} appears twice.`;
    threadIds.add(id);
    const status = getString(item, 'status');
    if (status !== 'open' && status !== 'resolved') return `${where} has an invalid status.`;

    const anchorValue = get(item, 'anchor');
    if (anchorValue?.t !== 'obj') return `${where} has no anchor.`;
    const state = getString(anchorValue, 'state');
    const exact = getString(anchorValue, 'exact');
    const prefix = getString(anchorValue, 'prefix');
    const suffix = getString(anchorValue, 'suffix');
    if (exact === undefined || prefix === undefined || suffix === undefined || exact.length === 0) return `${where} has an incomplete anchor.`;
    const start = readOffset(get(anchorValue, 'start'));
    const end = readOffset(get(anchorValue, 'end'));
    let anchor: AnchorData;
    if (state === 'attached') {
      if (typeof start !== 'number' || typeof end !== 'number' || start >= end) return `${where} has an invalid range.`;
      if (digestMatches && (end > body.length || body.substring(start, end) !== exact)) return `${where} does not match the document text.`;
      anchor = { state, start, end, exact, prefix, suffix };
    } else if (state === 'orphaned') {
      if (start !== null || end !== null) return `${where} is unattached but still has a range.`;
      anchor = { state, start: null, end: null, exact, prefix, suffix };
    } else {
      return `${where} has an invalid anchor state.`;
    }

    const messagesValue = get(item, 'messages');
    if (messagesValue?.t !== 'arr' || messagesValue.items.length === 0) return `${where} has no messages.`;
    const messages: MessageView[] = [];
    for (const message of messagesValue.items) {
      if (message.t !== 'obj') return `${where} has a message that is not an object.`;
      const messageId = getString(message, 'id');
      if (!messageId || !ID.test(messageId)) return `${where} has a message with an invalid id.`;
      if (messageIds.has(messageId)) return `Message id ${messageId} appears twice.`;
      messageIds.add(messageId);
      const author = get(message, 'author');
      const authorId = author?.t === 'obj' ? getString(author, 'id') : undefined;
      const authorName = author?.t === 'obj' ? getString(author, 'name') : undefined;
      if (authorId === undefined || authorName === undefined) return `${where} has a message without an author.`;
      const createdAt = getString(message, 'createdAt');
      if (!createdAt || !isDate(createdAt)) return `${where} has a message with an invalid date.`;
      const updatedValue = get(message, 'updatedAt');
      if (updatedValue !== undefined && (updatedValue.t !== 'str' || !isDate(updatedValue.v))) return `${where} has a message with an invalid edit date.`;
      const content = getString(message, 'content');
      if (!content) return `${where} has an empty message.`;
      messages.push({
        json: message,
        id: messageId,
        authorId,
        authorName,
        createdAt,
        updatedAt: updatedValue?.t === 'str' ? updatedValue.v : undefined,
        content,
      });
    }
    threads.push({ json: item, id, status, anchor, messages });
  }
  return { root, threads, digestMatches };
}

/** JSON whose text cannot end or open an HTML comment, and that older HTML tools also read as a safe comment. */
export function safeJson(value: JsonValue, eol: Eol): string {
  const text = stringifyJson(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/--/g, '\\u002d\\u002d');
  if (text.includes('--') || text.includes('<!--') || text.includes('-->')) throw new Error('Unsafe comment payload');
  return eol === '\n' ? text : text.replace(/\n/g, eol);
}

/** The whole file: the exact body, then the footer. Without threads the footer is left out entirely. */
export function composeFile(body: string, root: JsonObject | null, eol: Eol): string {
  const threads = root ? get(root, 'threads') : undefined;
  if (!root || threads?.t !== 'arr' || threads.items.length === 0) return body;
  return `${body}${eol}${eol}${OPENER}${eol}${safeJson(root, eol)}${eol}${CLOSER}${eol}`;
}

/** Creating comments is refused when the footer would not be recognised after the body, for example after an unclosed fence. */
export function canAppendFooter(body: string): boolean {
  const eol = prevailingEol(body);
  const probe = composeFile(body, newRoot(body, [newThreadJson({ start: 0, end: 1, exact: 'x', prefix: '', suffix: '' }, 'Probe', 'local:probe', 'probe')]), eol);
  const parsed = parseReview(probe);
  return parsed.kind !== 'none' && parsed.body === body && (parsed.kind === 'ok' || parsed.reason.includes('does not match'));
}

export function newId(prefix: 't' | 'm'): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function nowUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function contextAround(body: string, start: number, end: number): { prefix: string; suffix: string } {
  const before = Array.from(body.substring(Math.max(0, start - CONTEXT_CODE_POINTS * 2), start));
  const after = Array.from(body.substring(end, end + CONTEXT_CODE_POINTS * 2));
  let prefixPoints = before.slice(-CONTEXT_CODE_POINTS);
  // A cut in the middle of a surrogate pair leaves a lone low surrogate at the front; it is not part of the context.
  if (prefixPoints.length && /^[\uDC00-\uDFFF]$/.test(prefixPoints[0]) && before.length > CONTEXT_CODE_POINTS) prefixPoints = prefixPoints.slice(1);
  return { prefix: prefixPoints.join(''), suffix: after.slice(0, CONTEXT_CODE_POINTS).join('') };
}

export function anchorJson(anchor: AnchorData): JsonObject {
  return jobj([
    ['state', jstr(anchor.state)],
    ['start', anchor.start === null ? jnull : jnum(anchor.start)],
    ['end', anchor.end === null ? jnull : jnum(anchor.end)],
    ['exact', jstr(anchor.exact)],
    ['prefix', jstr(anchor.prefix)],
    ['suffix', jstr(anchor.suffix)],
  ]);
}

/** Updates an anchor object in place, keeping any extension fields where they are. */
export function writeAnchor(target: JsonObject, anchor: AnchorData): void {
  set(target, 'state', jstr(anchor.state));
  set(target, 'start', anchor.start === null ? jnull : jnum(anchor.start));
  set(target, 'end', anchor.end === null ? jnull : jnum(anchor.end));
  set(target, 'exact', jstr(anchor.exact));
  set(target, 'prefix', jstr(anchor.prefix));
  set(target, 'suffix', jstr(anchor.suffix));
}

export function newMessageJson(content: string, authorName: string, authorId: string): JsonObject {
  return jobj([
    ['id', jstr(newId('m'))],
    ['author', jobj([['id', jstr(authorId)], ['name', jstr(authorName)]])],
    ['createdAt', jstr(nowUtc())],
    ['content', jstr(content)],
  ]);
}

export function newThreadJson(
  range: { start: number; end: number; exact: string; prefix: string; suffix: string },
  authorName: string,
  authorId: string,
  content: string
): JsonObject {
  return jobj([
    ['id', jstr(newId('t'))],
    ['status', jstr('open')],
    ['anchor', anchorJson({ state: 'attached', ...range })],
    ['messages', jarr([newMessageJson(content, authorName, authorId)])],
  ]);
}

export function newRoot(body: string, threads: JsonObject[]): JsonObject {
  return jobj([
    ['format', jstr('livemark-comments')],
    ['version', jnum(1)],
    ['offsetUnit', jstr('utf16')],
    ['bodySha256', jstr(sha256Hex(body))],
    ['threads', jarr(threads)],
  ]);
}

export { clone };
