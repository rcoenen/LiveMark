import { renderFragment } from '../markdown';
import type { DocumentPane } from '../pane';
import type { DocumentSnapshot, LiveMarkBridge } from '../platform';
import { t, tCount } from '../strings';
import { clearHighlights, highlightBlock, renderedRange, sourceBlocks, sourceRangeForSelection, type SelectionResult } from './dom';
import type { AnchorData, ThreadView } from './format';
import { applyAction, readOnlyReason, restoreFile, threadsOf, type Author, type CommentAction, type CommentState } from './state';

export interface CommentDoc {
  id: string;
  content: string;
  comments: CommentState;
  missing: boolean;
}

export interface CommentsHost {
  livemark: LiveMarkBridge;
  activeDocument(): CommentDoc | null;
  documentFor(pane: DocumentPane): CommentDoc | null;
  visiblePanes(): DocumentPane[];
  showToast(title: string, detail: string, duration: number, action?: { label: string; run: () => void }): void;
  /** Makes the Comments section visible and expanded. */
  revealSection(): void;
  /** Records a file LiveMark wrote itself, without counting it as a reload. */
  applyWrite(documentId: string, snapshot: DocumentSnapshot): void;
}

type Filter = 'open' | 'resolved' | 'all' | 'unattached';
const FILTERS: Filter[] = ['open', 'resolved', 'all', 'unattached'];
const AUTHOR_KEY = 'livemark-comment-author';
const FILTER_KEY = 'livemark-comment-filter';
const UNDOABLE = new Set<CommentAction['kind']>(['delete-thread', 'delete-message', 'status', 'reattach']);

interface Pending {
  documentId: string;
  start: number;
  end: number;
  quote: string;
}

function readAuthor(): Author | null {
  try {
    const name = (JSON.parse(localStorage.getItem(AUTHOR_KEY) ?? 'null') as { name?: string } | null)?.name?.trim();
    return name ? { name, id: `local:${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'me'}` } : null;
  } catch {
    return null;
  }
}

function saveAuthor(name: string): void {
  try {
    localStorage.setItem(AUTHOR_KEY, JSON.stringify({ name }));
  } catch {
    // The name is asked for again next time.
  }
}

const formatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The commented text as the reader saw it: the stored quote is Markdown source. */
function displayQuote(exact: string): string {
  return (renderFragment(exact).textContent ?? '').trim() || exact;
}

function shorten(text: string, length: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.substring(0, length - 1)}…` : flat;
}

export interface CommentsController {
  render(): void;
  /** Ctrl+Alt+M / Cmd+Option+M: comment on the current selection. */
  commentOnSelection(): void;
  undo(): boolean;
}

export function initComments(host: CommentsHost): CommentsController {
  const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
  const sectionEl = byId('comments-section');
  const summaryEl = byId('comments-summary');
  const noticeEl = byId('comments-notice');
  const filterEl = byId('comments-filter');
  const composerEl = byId<HTMLFormElement>('comments-composer');
  const composerQuoteEl = byId('comments-composer-quote');
  const authorRowEl = byId('comments-author-row');
  const authorInput = byId<HTMLInputElement>('comments-author');
  const composerInput = byId<HTMLTextAreaElement>('comments-composer-input');
  const listEl = byId('comments-list');
  const emptyEl = byId('comments-empty');
  const addButton = byId<HTMLButtonElement>('comment-add-btn');
  const addLabel = addButton.querySelector('[data-string="comments.add"]') as HTMLElement;
  const chooserEl = byId('comment-chooser');
  const liveEl = element('span', 'visually-hidden');
  liveEl.setAttribute('aria-live', 'polite');
  sectionEl.appendChild(liveEl);

  let filter: Filter = (() => {
    try {
      const stored = localStorage.getItem(FILTER_KEY) as Filter | null;
      return stored && FILTERS.includes(stored) ? stored : 'open';
    } catch {
      return 'open';
    }
  })();
  let pending: Pending | null = null;
  let activeThreadId: string | null = null;
  let reattachThreadId: string | null = null;
  let editing: { threadId: string; messageId: string } | null = null;
  let replying: string | null = null;
  let busy = false;
  let selectionResult: { pane: DocumentPane; doc: CommentDoc; result: SelectionResult } | null = null;
  const drafts = new Map<string, string>();
  const undoStacks = new Map<string, string[]>();
  let returnFocus: HTMLElement | null = null;

  const isAttached = (anchor: AnchorData | undefined): boolean => anchor?.state === 'attached';
  const anchorOf = (doc: CommentDoc, thread: ThreadView): AnchorData => doc.comments.anchors.get(thread.id) ?? thread.anchor;

  function inFilter(doc: CommentDoc, thread: ThreadView, which: Filter): boolean {
    const attached = isAttached(anchorOf(doc, thread));
    if (which === 'open') return thread.status === 'open' && attached;
    if (which === 'resolved') return thread.status === 'resolved';
    if (which === 'unattached') return !attached;
    return true;
  }

  /** Attached threads in document order, then unattached ones in the order they were created. */
  function ordered(doc: CommentDoc, threads: ThreadView[]): ThreadView[] {
    const attached = threads.filter((thread) => isAttached(anchorOf(doc, thread)));
    const loose = threads.filter((thread) => !isAttached(anchorOf(doc, thread)));
    attached.sort((a, b) => (anchorOf(doc, a).start ?? 0) - (anchorOf(doc, b).start ?? 0));
    return [...attached, ...loose];
  }

  function readOnly(doc: CommentDoc): string | null {
    if (doc.missing) return 'the file was not found.';
    const reason = readOnlyReason(doc.comments);
    return reason ? reason.replace(/^\w/, (first) => first.toLowerCase()) : null;
  }

  async function write(doc: CommentDoc, text: string, undoText: string | null, done?: string): Promise<boolean> {
    if (busy) return false;
    busy = true;
    try {
      const snapshot = await host.livemark.writeDocument(doc.id, doc.content, text);
      if (undoText !== null) {
        const stack = undoStacks.get(doc.id) ?? [];
        stack.push(undoText);
        undoStacks.set(doc.id, stack.slice(-50));
      }
      host.applyWrite(doc.id, snapshot);
      if (done) host.showToast(done, '', 4000, undoText !== null ? { label: t('toast.undo'), run: () => void undoFor(doc.id) } : undefined);
      return true;
    } catch (error) {
      const message = String(error);
      host.showToast(t('toast.commentSaveFailed'), /conflict/i.test(message) ? t('toast.commentConflict') : message, 5000);
      return false;
    } finally {
      busy = false;
    }
  }

  async function act(action: CommentAction, done?: string): Promise<boolean> {
    const doc = host.activeDocument();
    if (!doc) return false;
    const author = readAuthor() ?? { id: 'local:me', name: 'Me' };
    let text: string;
    try {
      text = applyAction(doc.comments, action, author);
    } catch (error) {
      host.showToast(t('toast.commentSaveFailed'), error instanceof Error ? error.message : String(error), 5000);
      return false;
    }
    return write(doc, text, UNDOABLE.has(action.kind) ? doc.content : null, done);
  }

  async function undoFor(documentId: string): Promise<boolean> {
    const doc = host.activeDocument();
    const stack = undoStacks.get(documentId);
    if (!doc || doc.id !== documentId || !stack?.length || readOnly(doc)) return false;
    const previous = stack.pop() as string;
    const ok = await write(doc, restoreFile({ text: previous }, doc.comments), null, t('toast.commentUndone'));
    if (!ok) stack.push(previous);
    return ok;
  }

  // Highlights

  function applyHighlights(): void {
    for (const pane of host.visiblePanes()) {
      clearHighlights(pane.content);
      const doc = host.documentFor(pane);
      if (!doc) continue;
      const body = doc.comments.parse.body;
      const blocks = sourceBlocks(pane.content);
      const perBlock = new Map<HTMLElement, Array<{ start: number; end: number; id: string }>>();
      const add = (start: number, end: number, id: string): boolean => {
        const block = blocks.find((candidate) => candidate.start <= start && end <= candidate.end);
        const rendered = block ? renderedRange(block, body, start, end) : null;
        if (!block || !rendered) return false;
        perBlock.set(block.element, [...(perBlock.get(block.element) ?? []), { ...rendered, id }]);
        return true;
      };
      const resolvedIds = new Set<string>();
      for (const thread of threadsOf(doc.comments)) {
        const anchor = anchorOf(doc, thread);
        if (anchor.state !== 'attached' || anchor.start === null || anchor.end === null) continue;
        const shown = filter === 'all' || (filter === 'resolved' ? thread.status === 'resolved' : thread.status === 'open');
        if (!shown) continue;
        if (thread.status === 'resolved') resolvedIds.add(thread.id);
        add(anchor.start, anchor.end, thread.id);
      }
      if (pending && pending.documentId === doc.id) add(pending.start, pending.end, 'pending');
      for (const [block, intervals] of perBlock) highlightBlock(block, intervals);
      for (const mark of Array.from(pane.content.querySelectorAll<HTMLElement>('mark.lm-comment'))) {
        const ids = (mark.dataset.threads ?? '').split(' ');
        mark.classList.toggle('is-pending', ids.includes('pending'));
        mark.classList.toggle('is-resolved', ids.every((id) => resolvedIds.has(id)));
        mark.classList.toggle('is-active', activeThreadId !== null && ids.includes(activeThreadId));
      }
    }
  }

  // Sidebar

  function renderFilters(doc: CommentDoc): void {
    filterEl.replaceChildren();
    const threads = threadsOf(doc.comments);
    for (const which of FILTERS) {
      const button = element('button', 'comments-filter__item');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(which === filter));
      const count = threads.filter((thread) => inFilter(doc, thread, which)).length;
      button.append(element('span', '', t(`comments.filter.${which}` as never)), element('span', 'comments-filter__count', String(count)));
      button.addEventListener('click', () => {
        filter = which;
        try {
          localStorage.setItem(FILTER_KEY, which);
        } catch {
          // Only remembered for this session.
        }
        render();
      });
      filterEl.appendChild(button);
    }
  }

  function messageView(doc: CommentDoc, thread: ThreadView, message: ThreadView['messages'][number], locked: boolean): HTMLElement {
    const item = element('li', 'comment-message');
    const meta = element('div', 'comment-message__meta');
    meta.append(element('span', 'comment-message__author', message.authorName));
    const time = element('time', 'comment-message__time', formatter.format(new Date(message.createdAt)));
    time.dateTime = message.createdAt;
    time.title = message.createdAt;
    meta.appendChild(time);
    if (message.updatedAt) meta.appendChild(element('span', 'comment-message__edited', `· ${t('comments.edited')}`));
    if (!locked) {
      const actions = element('span', 'comment-message__actions');
      const edit = element('button', 'link-button', t('comments.edit'));
      edit.type = 'button';
      edit.addEventListener('click', () => {
        editing = { threadId: thread.id, messageId: message.id };
        render();
      });
      const remove = element('button', 'link-button', t('comments.delete'));
      remove.type = 'button';
      remove.addEventListener('click', () => void act({ kind: 'delete-message', threadId: thread.id, messageId: message.id }, t('toast.commentDeleted')));
      actions.append(edit, remove);
      meta.appendChild(actions);
    }
    item.appendChild(meta);

    if (editing?.threadId === thread.id && editing.messageId === message.id && !locked) {
      item.appendChild(inlineForm(`${doc.id}|edit|${message.id}`, message.content, t('comments.save'), async (content) => {
        const ok = await act({ kind: 'edit', threadId: thread.id, messageId: message.id, content });
        if (ok) editing = null;
        return ok;
      }, () => {
        editing = null;
        render();
      }));
    } else {
      item.appendChild(element('p', 'comment-message__content', message.content));
    }
    return item;
  }

  /** A small text form for replies and edits; Ctrl/Cmd+Enter sends, Escape closes and keeps the draft. */
  function inlineForm(key: string, initial: string, label: string, submit: (content: string) => Promise<boolean>, cancel: () => void): HTMLElement {
    const form = element('form', 'comment-inline-form');
    const input = element('textarea');
    input.rows = 2;
    input.value = drafts.get(key) ?? initial;
    input.placeholder = t('comments.replyPlaceholder');
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => drafts.set(key, input.value));
    const actions = element('div', 'comment-composer__actions');
    const cancelButton = element('button', 'link-button', t('comments.cancel'));
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', cancel);
    const send = element('button', 'comment-button', label);
    send.type = 'submit';
    actions.append(cancelButton, send);
    form.append(input, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const content = input.value.trim();
      if (!content) return;
      void submit(content).then((ok) => {
        if (ok) {
          drafts.delete(key);
          render();
        }
      });
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        form.requestSubmit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    });
    window.requestAnimationFrame(() => {
      if (input.isConnected) input.focus();
    });
    return form;
  }

  function threadView(doc: CommentDoc, thread: ThreadView, locked: boolean): HTMLElement {
    const anchor = anchorOf(doc, thread);
    const attached = isAttached(anchor);
    const card = element('article', 'comment-thread');
    card.dataset.threadId = thread.id;
    card.tabIndex = -1;
    card.classList.toggle('is-resolved', thread.status === 'resolved');
    card.classList.toggle('is-active', thread.id === activeThreadId);
    card.classList.toggle('is-unattached', !attached);
    card.setAttribute('aria-label', t('comments.threadLabel', { author: thread.messages[0].authorName, quote: shorten(displayQuote(anchor.exact), 60) }));

    const quote = element('button', 'comment-thread__quote');
    quote.type = 'button';
    if (!attached) quote.appendChild(element('span', 'comment-thread__state', t('comments.unattachedLabel')));
    quote.appendChild(element('span', 'comment-thread__quote-text', shorten(displayQuote(anchor.exact), 140)));
    quote.disabled = !attached;
    quote.addEventListener('click', () => activate(thread.id, 'document'));
    card.appendChild(quote);
    if (thread.status === 'resolved') card.appendChild(element('span', 'comment-thread__badge', t('comments.resolved')));

    const messages = element('ol', 'comment-thread__messages');
    for (const message of thread.messages) messages.appendChild(messageView(doc, thread, message, locked));
    card.appendChild(messages);

    if (!locked) {
      if (replying === thread.id) {
        card.appendChild(inlineForm(`${doc.id}|reply|${thread.id}`, '', t('comments.reply'), (content) => act({ kind: 'reply', threadId: thread.id, content }), () => {
          replying = null;
          render();
          card.focus();
        }));
      }
      const actions = element('div', 'comment-thread__actions');
      const button = (label: string, run: () => void, className = 'link-button'): HTMLButtonElement => {
        const node = element('button', className, label);
        node.type = 'button';
        node.addEventListener('click', run);
        actions.appendChild(node);
        return node;
      };
      if (replying !== thread.id) button(t('comments.reply'), () => {
        replying = thread.id;
        activeThreadId = thread.id;
        render();
      });
      if (thread.status === 'open') button(t('comments.resolve'), () => void act({ kind: 'status', threadId: thread.id, status: 'resolved' }, t('toast.commentResolved')));
      else button(t('comments.reopen'), () => void act({ kind: 'status', threadId: thread.id, status: 'open' }));
      if (!attached || reattachThreadId === thread.id) {
        const reattach = button(reattachThreadId === thread.id ? t('comments.cancel') : t('comments.reattach'), () => {
          reattachThreadId = reattachThreadId === thread.id ? null : thread.id;
          render();
          updateAddButton();
        });
        if (reattachThreadId === thread.id) actions.appendChild(element('span', 'comment-thread__hint', t('comments.reattachHint')));
        reattach.setAttribute('aria-pressed', String(reattachThreadId === thread.id));
      }
      button(t('comments.deleteThread'), () => void act({ kind: 'delete-thread', threadId: thread.id }, t('toast.commentDeleted')), 'link-button comment-thread__delete');
      card.appendChild(actions);
    }
    card.addEventListener('focusin', () => setActive(thread.id));
    card.addEventListener('mouseenter', () => markActive(thread.id, true));
    card.addEventListener('mouseleave', () => markActive(activeThreadId, true));
    return card;
  }

  function markActive(threadId: string | null, onlyMarks = false): void {
    for (const pane of host.visiblePanes()) {
      for (const mark of Array.from(pane.content.querySelectorAll<HTMLElement>('mark.lm-comment'))) {
        mark.classList.toggle('is-active', threadId !== null && (mark.dataset.threads ?? '').split(' ').includes(threadId));
      }
    }
    if (onlyMarks) return;
    for (const card of Array.from(listEl.querySelectorAll<HTMLElement>('.comment-thread'))) {
      card.classList.toggle('is-active', card.dataset.threadId === threadId);
    }
  }

  function setActive(threadId: string): void {
    if (activeThreadId === threadId) return;
    activeThreadId = threadId;
    markActive(threadId);
  }

  /** Opens a thread: from a highlight it focuses the card, from the card it scrolls the text into view. */
  function activate(threadId: string, target: 'card' | 'document'): void {
    const doc = host.activeDocument();
    const thread = doc ? threadsOf(doc.comments).find((candidate) => candidate.id === threadId) : undefined;
    if (!doc || !thread) return;
    activeThreadId = threadId;
    if (!inFilter(doc, thread, filter)) filter = 'all';
    host.revealSection();
    render();
    const card = listEl.querySelector<HTMLElement>(`[data-thread-id="${threadId}"]`);
    liveEl.textContent = `${t('comments.threadLabel', { author: thread.messages[0].authorName, quote: shorten(displayQuote(anchorOf(doc, thread).exact), 60) })}, ${t(thread.status === 'open' ? 'comments.filter.open' : 'comments.resolved')}`;
    if (target === 'card') {
      card?.scrollIntoView({ block: 'nearest' });
      card?.focus({ preventScroll: true });
      return;
    }
    const mark = host.visiblePanes()
      .flatMap((pane) => Array.from(pane.content.querySelectorAll<HTMLElement>('mark.lm-comment')))
      .find((candidate) => (candidate.dataset.threads ?? '').split(' ').includes(threadId));
    mark?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function render(): void {
    const doc = host.activeDocument();
    sectionEl.hidden = !doc;
    if (!doc) {
      for (const pane of host.visiblePanes()) clearHighlights(pane.content);
      updateAddButton();
      return;
    }
    const locked = readOnly(doc);
    const threads = threadsOf(doc.comments);
    if (activeThreadId && !threads.some((thread) => thread.id === activeThreadId)) activeThreadId = null;
    if (reattachThreadId && !threads.some((thread) => thread.id === reattachThreadId)) reattachThreadId = null;

    const openCount = threads.filter((thread) => thread.status === 'open').length;
    summaryEl.textContent = openCount ? String(openCount) : '';
    sectionEl.dataset.state = threads.length ? 'has-comments' : 'empty';

    if (locked) {
      noticeEl.textContent = t('comments.readOnly', { reason: locked });
      noticeEl.hidden = false;
      noticeEl.classList.add('is-warning');
      const repair = doc.comments.parse.kind === 'readonly' && !doc.missing ? doc.comments.parse.repair : undefined;
      if (repair) {
        const fix = element('button', 'link-button comments-notice__action', t('comments.repair'));
        fix.type = 'button';
        fix.addEventListener('click', () => void write(doc, repair, null, t('toast.commentsRepaired')));
        noticeEl.append(' ', fix);
      }
    } else if (doc.comments.recovered || doc.comments.orphanedNow) {
      const parts: string[] = [];
      if (doc.comments.recovered) parts.push(tCount('comments.repaired.recovered', doc.comments.recovered));
      if (doc.comments.orphanedNow) parts.push(tCount('comments.repaired.orphaned', doc.comments.orphanedNow));
      noticeEl.textContent = parts.join(' · ');
      noticeEl.hidden = false;
      noticeEl.classList.remove('is-warning');
    } else {
      noticeEl.hidden = true;
    }

    renderFilters(doc);
    filterEl.hidden = threads.length === 0;
    listEl.replaceChildren();
    const shown = ordered(doc, threads.filter((thread) => inFilter(doc, thread, filter)));
    for (const thread of shown) listEl.appendChild(threadView(doc, thread, locked !== null));
    emptyEl.textContent = locked && threads.length === 0 ? '' : t(`comments.empty.${filter}` as never);
    emptyEl.hidden = shown.length > 0 || (locked !== null && threads.length === 0);

    const composing = pending !== null && pending.documentId === doc.id && !locked;
    composerEl.hidden = !composing;
    if (composing && pending) {
      composerQuoteEl.textContent = shorten(displayQuote(pending.quote), 140);
      authorRowEl.hidden = readAuthor() !== null;
    }
    applyHighlights();
    updateAddButton();
  }

  // Selection and the floating Comment button

  function paneOf(node: Node): DocumentPane | null {
    return host.visiblePanes().find((pane) => pane.content.contains(node)) ?? null;
  }

  function evaluateSelection(): void {
    selectionResult = null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const pane = paneOf(range.commonAncestorContainer);
    const doc = pane ? host.documentFor(pane) : null;
    if (!pane || !doc) return;
    const locked = readOnly(doc);
    const result: SelectionResult = locked
      ? { ok: false, reason: t('comments.readOnly', { reason: locked }) }
      : sourceRangeForSelection(range, pane.content, doc.comments.parse.body);
    selectionResult = { pane, doc, result };
  }

  function updateAddButton(): void {
    if (!selectionResult) {
      addButton.hidden = true;
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      addButton.hidden = true;
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const { result } = selectionResult;
    addLabel.textContent = reattachThreadId ? t('comments.reattachHere') : t('comments.add');
    addButton.setAttribute('aria-disabled', String(!result.ok));
    addButton.classList.toggle('is-disabled', !result.ok);
    addButton.title = result.ok ? '' : result.reason;
    addButton.hidden = false;
    const width = addButton.offsetWidth || 120;
    addButton.style.left = `${Math.max(8, Math.min(rect.right - width / 2, window.innerWidth - width - 8))}px`;
    addButton.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 40)}px`;
  }

  let selectionQueued = false;
  document.addEventListener('selectionchange', () => {
    if (selectionQueued) return;
    selectionQueued = true;
    window.requestAnimationFrame(() => {
      selectionQueued = false;
      evaluateSelection();
      updateAddButton();
    });
  });

  // Keep the floating button next to the selection while the document scrolls.
  document.addEventListener('scroll', () => {
    if (!addButton.hidden) updateAddButton();
  }, true);

  function commentOnSelection(): void {
    evaluateSelection();
    if (!selectionResult) return;
    const { result, doc } = selectionResult;
    if (!result.ok) {
      host.showToast(t('toast.commentRefused'), result.reason, 3500);
      return;
    }
    if (reattachThreadId) {
      const threadId = reattachThreadId;
      reattachThreadId = null;
      window.getSelection()?.removeAllRanges();
      void act({ kind: 'reattach', threadId, start: result.start, end: result.end });
      return;
    }
    returnFocus = selectionResult.pane.content;
    pending = { documentId: doc.id, start: result.start, end: result.end, quote: doc.comments.parse.body.substring(result.start, result.end) };
    window.getSelection()?.removeAllRanges();
    selectionResult = null;
    host.revealSection();
    render();
    composerInput.value = drafts.get(`${doc.id}|compose`) ?? '';
    (authorRowEl.hidden ? composerInput : authorInput).focus();
  }

  addButton.addEventListener('mousedown', (event) => event.preventDefault());
  addButton.addEventListener('click', commentOnSelection);

  function closeComposer(keepDraft: boolean): void {
    if (!keepDraft && pending) drafts.delete(`${pending.documentId}|compose`);
    pending = null;
    render();
    returnFocus?.focus({ preventScroll: true });
    returnFocus = null;
  }

  composerInput.addEventListener('input', () => {
    if (pending) drafts.set(`${pending.documentId}|compose`, composerInput.value);
  });
  composerEl.addEventListener('submit', (event) => {
    event.preventDefault();
    const content = composerInput.value.trim();
    if (!pending || !content) return;
    if (!readAuthor()) {
      const name = authorInput.value.trim();
      if (!name) {
        authorInput.focus();
        return;
      }
      saveAuthor(name);
    }
    const { start, end } = pending;
    void act({ kind: 'add', start, end, content }).then((ok) => {
      if (ok) closeComposer(false);
    });
  });
  byId('comments-composer-cancel').addEventListener('click', () => closeComposer(true));
  composerEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      composerEl.requestSubmit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeComposer(true);
    }
  });

  // Clicking a highlight opens its thread; a shared highlight asks which one.

  function closeChooser(): void {
    chooserEl.hidden = true;
  }

  document.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (!chooserEl.hidden && !chooserEl.contains(target)) closeChooser();
    const mark = target.closest?.('mark.lm-comment') as HTMLElement | null;
    if (!mark || !paneOf(mark) || window.getSelection()?.isCollapsed === false) return;
    const ids = (mark.dataset.threads ?? '').split(' ').filter((id) => id && id !== 'pending');
    if (ids.length === 0) return;
    if (ids.length === 1) {
      activate(ids[0], 'card');
      return;
    }
    const doc = host.activeDocument();
    if (!doc) return;
    chooserEl.replaceChildren();
    for (const id of ids) {
      const thread = threadsOf(doc.comments).find((candidate) => candidate.id === id);
      if (!thread) continue;
      const item = element('button', 'tab-menu__item', `${thread.messages[0].authorName}: ${shorten(thread.messages[0].content, 48)}`);
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.addEventListener('click', () => {
        closeChooser();
        activate(id, 'card');
      });
      chooserEl.appendChild(item);
    }
    const rect = mark.getBoundingClientRect();
    chooserEl.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
    chooserEl.style.top = `${rect.bottom + 6}px`;
    chooserEl.hidden = false;
    (chooserEl.firstElementChild as HTMLElement | null)?.focus();
  });
  chooserEl.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeChooser();
    }
  });

  return {
    render,
    commentOnSelection,
    undo(): boolean {
      const doc = host.activeDocument();
      if (!doc || !(undoStacks.get(doc.id)?.length)) return false;
      void undoFor(doc.id);
      return true;
    },
  };
}
