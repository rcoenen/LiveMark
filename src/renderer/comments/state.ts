import { followEdit, reopen } from './anchors';
import {
  canAppendFooter,
  clone,
  composeFile,
  newMessageJson,
  newRoot,
  newThreadJson,
  parseReview,
  writeAnchor,
  type AnchorData,
  type ReviewParse,
  type ThreadView,
  contextAround,
} from './format';
import { get, jarr, jstr, set, type JsonObject } from './json';
import { sha256Hex } from './sha256';

/** Comments of one open document: the file as last read, and anchors as they stand against its body now. */
export interface CommentState {
  parse: ReviewParse;
  anchors: Map<string, AnchorData>;
  /** Anchors moved or detached since the footer was written; saved with the next comment change. */
  recovered: number;
  orphanedNow: number;
}

/**
 * Reads the comments of a file. When the previous state of the same document is known and only the body
 * changed, anchors follow the edit; otherwise they are re-attached from the stored offsets or the quote.
 */
export function loadComments(text: string, previous?: CommentState): CommentState {
  const parse = parseReview(text);
  const anchors = new Map<string, AnchorData>();
  let recovered = 0;
  let orphanedNow = 0;
  if (parse.kind === 'ok') {
    const sameFooter = previous?.parse.kind === 'ok' && previous.parse.envelope.raw === parse.envelope.raw;
    for (const thread of parse.threads) {
      const live = sameFooter && previous ? previous.anchors.get(thread.id) : undefined;
      const anchor = live && previous ? followEdit(live, previous.parse.body, parse.body) : reopen(thread.anchor, parse.body, parse.digestMatches);
      anchors.set(thread.id, anchor);
      if (thread.anchor.state === 'attached' && anchor.state === 'orphaned') orphanedNow++;
      else if (anchor.state === 'attached' && (anchor.start !== thread.anchor.start || anchor.end !== thread.anchor.end)) recovered++;
    }
  }
  return { parse, anchors, recovered, orphanedNow };
}

export function threadsOf(state: CommentState): ThreadView[] {
  return state.parse.kind === 'ok' ? state.parse.threads : [];
}

/** Why comments cannot be added or changed in this file right now, or null when they can. */
export function readOnlyReason(state: CommentState): string | null {
  if (state.parse.kind === 'readonly') return state.parse.reason;
  if (state.parse.kind === 'none' && !canAppendFooter(state.parse.body)) {
    return 'The file ends inside a code block or HTML block, so a comment block cannot be added after it.';
  }
  return null;
}

/** A copy of the stored root with every anchor brought up to date with the current body. */
function currentRoot(state: CommentState): JsonObject {
  const body = state.parse.body;
  if (state.parse.kind !== 'ok') return newRoot(body, []);
  const root = clone(state.parse.root);
  set(root, 'bodySha256', jstr(sha256Hex(body)));
  const threads = get(root, 'threads');
  if (threads?.t === 'arr') {
    for (const item of threads.items) {
      if (item.t !== 'obj') continue;
      const id = get(item, 'id');
      const anchor = id?.t === 'str' ? state.anchors.get(id.v) : undefined;
      const target = get(item, 'anchor');
      if (anchor && target?.t === 'obj') writeAnchor(target, anchor);
    }
  }
  return root;
}

function threadList(root: JsonObject): JsonObject[] {
  const threads = get(root, 'threads');
  if (threads?.t !== 'arr') {
    const list = jarr([]);
    set(root, 'threads', list);
    return list.items as JsonObject[];
  }
  return threads.items as JsonObject[];
}

function findThread(root: JsonObject, threadId: string): JsonObject {
  const thread = threadList(root).find((item) => get(item, 'id')?.t === 'str' && (get(item, 'id') as { v: string }).v === threadId);
  if (!thread) throw new Error('That comment no longer exists.');
  return thread;
}

function messagesOf(thread: JsonObject): JsonObject[] {
  const messages = get(thread, 'messages');
  if (messages?.t !== 'arr') throw new Error('Malformed thread');
  return messages.items as JsonObject[];
}

export interface Author {
  id: string;
  name: string;
}

export type CommentAction =
  | { kind: 'add'; start: number; end: number; content: string }
  | { kind: 'reply'; threadId: string; content: string }
  | { kind: 'edit'; threadId: string; messageId: string; content: string }
  | { kind: 'delete-message'; threadId: string; messageId: string }
  | { kind: 'delete-thread'; threadId: string }
  | { kind: 'status'; threadId: string; status: 'open' | 'resolved' }
  | { kind: 'reattach'; threadId: string; start: number; end: number };

/** The complete new file for one comment action. The body bytes are always carried over unchanged. */
export function applyAction(state: CommentState, action: CommentAction, author: Author): string {
  const reason = readOnlyReason(state);
  if (reason) throw new Error(reason);
  const body = state.parse.body;
  const root = currentRoot(state);
  const threads = threadList(root);
  const range = (start: number, end: number) => ({ start, end, exact: body.substring(start, end), ...contextAround(body, start, end) });

  switch (action.kind) {
    case 'add':
      threads.push(newThreadJson(range(action.start, action.end), author.name, author.id, action.content));
      break;
    case 'reply':
      messagesOf(findThread(root, action.threadId)).push(newMessageJson(action.content, author.name, author.id));
      break;
    case 'edit': {
      const message = messagesOf(findThread(root, action.threadId)).find((item) => get(item, 'id')?.t === 'str' && (get(item, 'id') as { v: string }).v === action.messageId);
      if (!message) throw new Error('That message no longer exists.');
      set(message, 'content', jstr(action.content));
      set(message, 'updatedAt', jstr(new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')));
      break;
    }
    case 'delete-message': {
      const thread = findThread(root, action.threadId);
      const messages = messagesOf(thread).filter((item) => !(get(item, 'id')?.t === 'str' && (get(item, 'id') as { v: string }).v === action.messageId));
      if (messages.length === 0) {
        threads.splice(threads.indexOf(thread), 1);
      } else {
        set(thread, 'messages', jarr(messages));
      }
      break;
    }
    case 'delete-thread':
      threads.splice(threads.indexOf(findThread(root, action.threadId)), 1);
      break;
    case 'status':
      set(findThread(root, action.threadId), 'status', jstr(action.status));
      break;
    case 'reattach': {
      const target = get(findThread(root, action.threadId), 'anchor');
      if (target?.t !== 'obj') throw new Error('Malformed thread');
      writeAnchor(target, { state: 'attached', ...range(action.start, action.end) });
      break;
    }
  }
  return composeFile(body, threads.length ? root : null, state.parse.eol);
}

/**
 * The file that restores the comments as they were before an action, on top of the current body. When the
 * body changed in between, the restored anchors follow that change.
 */
export function restoreFile(snapshot: { text: string }, current: CommentState): string {
  const old = loadComments(snapshot.text);
  if (old.parse.kind !== 'ok') return composeFile(current.parse.body, null, current.parse.eol);
  const moved: CommentState = { ...old, anchors: new Map() };
  for (const thread of old.parse.threads) {
    const anchor = old.anchors.get(thread.id) ?? thread.anchor;
    moved.anchors.set(thread.id, followEdit(anchor, old.parse.body, current.parse.body));
  }
  moved.parse = { ...old.parse, body: current.parse.body };
  return composeFile(current.parse.body, currentRoot(moved), current.parse.eol);
}
