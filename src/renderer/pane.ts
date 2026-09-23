import { blockKey, changeableItems, isLocalImageSource, renderMarkdown } from './markdown';
import type { LiveMarkBridge } from './platform';
import { t } from './strings';

const MARK_FADE_MS = 1300;
const TITLEBAR_HEIGHT = 28;
const CLOSE_ICON = '<svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 4l7 7M11 4l-7 7"></path></svg>';

export interface PaneDocument {
  id: string;
  path: string;
  content: string;
}

export interface MarkRequest {
  keys: Set<string>;
  label: string;
  /** Timestamp until which the marks are highlighted; blocks stay jump targets after that. */
  visibleUntil: number;
}

export interface PaneHost {
  livemark: LiveMarkBridge;
  imageCache: Map<string, { modified: number; dataUrl: string }>;
  onFocus(pane: DocumentPane): void;
  onScroll(pane: DocumentPane): void;
  onClosePane(pane: DocumentPane): void;
  onDropDocument(pane: DocumentPane, documentId: string): void;
  onLinkFailed(href: string): void;
}

export const DOCUMENT_DRAG_TYPE = 'application/x-livemark-document';

interface ScrollAnchor {
  key: string;
  top: number;
}

/** One reading surface: its own scroll container, rendered document, change marks and scroll memory. */
export class DocumentPane {
  readonly element: HTMLElement;
  readonly scroller: HTMLElement;
  readonly layout: HTMLElement;
  readonly content: HTMLElement;
  documentId: string | null = null;

  private readonly headerName: HTMLElement;
  private readonly headerTime: HTMLElement;
  private readonly placeholder: HTMLElement;
  private readonly scrollPositions = new Map<string, number>();
  private marksTimer: number | null = null;
  private scrollQueued = false;

  constructor(readonly index: number, private readonly host: PaneHost) {
    this.element = document.createElement('section');
    this.element.className = 'pane';
    this.element.dataset.pane = String(index);

    const header = document.createElement('header');
    header.className = 'pane__header';
    header.setAttribute('data-tauri-drag-region', '');
    this.headerName = document.createElement('span');
    this.headerName.className = 'pane__name';
    this.headerTime = document.createElement('span');
    this.headerTime.className = 'pane__time';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'icon-button';
    closeButton.innerHTML = CLOSE_ICON;
    closeButton.title = t('pane.close');
    closeButton.setAttribute('aria-label', t('pane.close'));
    closeButton.addEventListener('click', () => host.onClosePane(this));
    header.append(this.headerName, this.headerTime, closeButton);

    this.scroller = document.createElement('div');
    this.scroller.className = 'pane__scroller';
    this.layout = document.createElement('div');
    this.layout.className = 'document-layout';
    this.content = document.createElement('main');
    this.content.className = 'content';
    this.content.id = `content-${index}`;
    this.content.tabIndex = 0;
    this.content.setAttribute('role', 'tabpanel');
    this.layout.appendChild(this.content);
    this.scroller.appendChild(this.layout);

    this.placeholder = document.createElement('div');
    this.placeholder.className = 'pane__placeholder';
    this.placeholder.textContent = t('pane.placeholder');

    this.element.append(header, this.scroller, this.placeholder);
    this.setEmpty(true);

    this.element.addEventListener('pointerdown', () => host.onFocus(this));
    this.element.addEventListener('focusin', () => host.onFocus(this));
    this.scroller.addEventListener('scroll', () => {
      if (this.scrollQueued) return;
      this.scrollQueued = true;
      window.requestAnimationFrame(() => {
        this.scrollQueued = false;
        this.element.classList.toggle('is-scrolled', this.scroller.scrollTop > 0);
        host.onScroll(this);
      });
    }, { passive: true });

    // The webview must never navigate away from the app, so every link click is handled here.
    const handleLinkClick = (event: MouseEvent): void => {
      const link = (event.target as Element).closest?.('a');
      if (!link || !this.content.contains(link)) return;
      event.preventDefault();
      const href = link.getAttribute('href');
      if (href) this.followLink(href);
    };
    this.content.addEventListener('click', handleLinkClick);
    this.content.addEventListener('auxclick', handleLinkClick);

    this.element.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes(DOCUMENT_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      this.element.classList.add('is-drop-target');
    });
    this.element.addEventListener('dragleave', () => this.element.classList.remove('is-drop-target'));
    this.element.addEventListener('drop', (event) => {
      this.element.classList.remove('is-drop-target');
      const documentId = event.dataTransfer?.getData(DOCUMENT_DRAG_TYPE);
      if (!documentId) return;
      event.preventDefault();
      host.onDropDocument(this, documentId);
    });
  }

  private setEmpty(empty: boolean): void {
    this.scroller.hidden = empty;
    this.placeholder.hidden = !empty;
    this.element.classList.toggle('is-empty', empty);
  }

  setHeader(name: string, time: string): void {
    this.headerName.textContent = name;
    this.headerTime.textContent = time;
  }

  saveScrollPosition(): void {
    if (this.documentId) {
      this.scrollPositions.set(this.documentId, this.scroller.scrollTop);
    }
  }

  forgetDocument(documentId: string, replacementId?: string): void {
    const saved = this.scrollPositions.get(documentId);
    this.scrollPositions.delete(documentId);
    if (replacementId !== undefined && saved !== undefined) {
      this.scrollPositions.set(replacementId, saved);
    }
  }

  clear(): void {
    this.saveScrollPosition();
    this.cancelMarksTimer();
    this.documentId = null;
    this.content.replaceChildren();
    this.content.removeAttribute('aria-labelledby');
    this.setHeader('', '');
    this.setEmpty(true);
  }

  /**
   * Shows a document. With `keepReadingPosition` the block at the top of the viewport stays where it is,
   * even when content was added or removed above it; otherwise the pane's saved position is restored.
   */
  show(documentState: PaneDocument, options: { container?: HTMLElement; keepReadingPosition?: boolean } = {}): void {
    const sameDocument = this.documentId === documentState.id;
    if (!sameDocument) this.saveScrollPosition();
    const anchors = sameDocument && options.keepReadingPosition ? this.captureScrollAnchors() : [];

    const rendered = options.container ?? renderMarkdown(documentState.content);
    for (const block of Array.from(rendered.children)) {
      const items = changeableItems(block);
      const itemKeys = items.map(blockKey);
      block.setAttribute('data-lm-key', blockKey(block));
      items.forEach((item, itemIndex) => item.setAttribute('data-lm-key', itemKeys[itemIndex]));
    }

    this.cancelMarksTimer();
    this.documentId = documentState.id;
    this.setEmpty(false);
    this.content.replaceChildren(...Array.from(rendered.childNodes));
    this.resolveLocalImages(documentState.id);

    if (this.restoreScrollAnchors(anchors)) return;
    const savedPosition = sameDocument ? this.scroller.scrollTop : this.scrollPositions.get(documentState.id) ?? 0;
    this.scroller.scrollTop = savedPosition;
    window.requestAnimationFrame(() => {
      if (this.documentId === documentState.id) this.scroller.scrollTop = savedPosition;
    });
  }

  private captureScrollAnchors(): ScrollAnchor[] {
    const anchors: ScrollAnchor[] = [];
    const viewportTop = this.scroller.getBoundingClientRect().top + TITLEBAR_HEIGHT;
    for (const block of Array.from(this.content.children)) {
      const rect = block.getBoundingClientRect();
      if (rect.bottom <= viewportTop) continue;
      anchors.push({ key: block.getAttribute('data-lm-key') ?? '', top: rect.top });
      if (anchors.length === 6) break;
    }
    return anchors;
  }

  private restoreScrollAnchors(anchors: ScrollAnchor[]): boolean {
    const blocks = Array.from(this.content.children);
    for (const anchor of anchors) {
      const match = blocks.find((block) => block.getAttribute('data-lm-key') === anchor.key);
      if (match) {
        this.scroller.scrollTop += match.getBoundingClientRect().top - anchor.top;
        return true;
      }
    }
    return false;
  }

  // Images already resolved are shown at once, so a reload does not blank them; the backend then confirms they are current.
  private resolveLocalImages(documentId: string): void {
    const { imageCache, livemark } = this.host;
    for (const image of Array.from(this.content.querySelectorAll<HTMLImageElement>('img'))) {
      const source = image.dataset.livemarkSource;
      if (!isLocalImageSource(source)) continue;
      const cacheKey = `${documentId}\n${source}`;
      const cached = imageCache.get(cacheKey);
      if (cached) {
        image.src = cached.dataUrl;
      }
      void livemark.resolveLocalImage(documentId, source, cached?.modified).then((resolved) => {
        const dataUrl = resolved.dataUrl ?? cached?.dataUrl;
        if (!dataUrl) return;
        imageCache.set(cacheKey, { modified: resolved.modified, dataUrl });
        if (resolved.dataUrl && this.documentId === documentId && image.isConnected) {
          image.src = dataUrl;
        }
      }).catch(() => {
        imageCache.delete(cacheKey);
        image.removeAttribute('src');
      });
    }
  }

  followLink(href: string): void {
    if (href.startsWith('#')) {
      let targetId = href.substring(1);
      try {
        targetId = decodeURIComponent(targetId);
      } catch {
        // Keep the raw fragment
      }
      const target = Array.from(this.content.querySelectorAll('[id], a[name]'))
        .find((candidate) => candidate.id === targetId || candidate.getAttribute('name') === targetId);
      target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (!this.documentId) return;
    this.host.livemark.openLink(this.documentId, href).catch(() => this.host.onLinkFailed(href));
  }

  private cancelMarksTimer(): void {
    if (this.marksTimer !== null) {
      window.clearTimeout(this.marksTimer);
      this.marksTimer = null;
    }
  }

  clearMarks(): void {
    this.cancelMarksTimer();
    for (const marked of Array.from(this.content.querySelectorAll('.lm-changed, [data-lm-target]'))) {
      marked.classList.remove('lm-changed', 'lm-fading');
      marked.removeAttribute('data-lm-label');
      marked.removeAttribute('data-lm-target');
    }
  }

  /** Tags the blocks of one reload as jump targets and highlights them while the marks are fresh. */
  applyMarks(request: MarkRequest | null, highlight: boolean): void {
    this.clearMarks();
    if (!request || request.keys.size === 0) return;

    const visible = highlight && Date.now() < request.visibleUntil;
    let labelled = false;
    const candidates = Array.from(this.content.children).flatMap((block) => [block, ...changeableItems(block)]);
    for (const candidate of candidates) {
      if (!request.keys.has(candidate.getAttribute('data-lm-key') ?? '')) continue;
      candidate.setAttribute('data-lm-target', '');
      if (!visible) continue;
      candidate.classList.add('lm-changed');
      const isTable = candidate.tagName === 'TABLE' || candidate.classList.contains('table-scroll');
      if (!labelled && candidate.parentElement === this.content && candidate.tagName !== 'PRE' && !isTable) {
        candidate.setAttribute('data-lm-label', request.label);
        labelled = true;
      }
    }
    if (!visible || !Number.isFinite(request.visibleUntil)) return;

    this.marksTimer = window.setTimeout(() => {
      for (const marked of Array.from(this.content.querySelectorAll('.lm-changed'))) {
        marked.classList.add('lm-fading');
      }
      this.marksTimer = window.setTimeout(() => {
        this.marksTimer = null;
        for (const marked of Array.from(this.content.querySelectorAll('.lm-changed'))) {
          marked.classList.remove('lm-changed', 'lm-fading');
          marked.removeAttribute('data-lm-label');
        }
      }, MARK_FADE_MS);
    }, request.visibleUntil - Date.now());
  }

  scrollToMarks(): boolean {
    const target = this.content.querySelector('[data-lm-target]');
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return target !== null;
  }

  /** Highlights every occurrence of `query` and returns how many there are. */
  find(query: string): number {
    this.clearFind();
    const needle = query.toLowerCase();
    if (!needle) return 0;

    const walker = document.createTreeWalker(this.content, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

    let total = 0;
    for (const node of textNodes) {
      const text = node.data;
      const lowered = text.toLowerCase();
      let position = lowered.indexOf(needle);
      if (position < 0) continue;

      const fragment = document.createDocumentFragment();
      let consumed = 0;
      while (position >= 0) {
        fragment.append(text.substring(consumed, position));
        const hit = document.createElement('mark');
        hit.className = 'lm-find';
        hit.textContent = text.substring(position, position + needle.length);
        fragment.append(hit);
        consumed = position + needle.length;
        position = lowered.indexOf(needle, consumed);
        total++;
      }
      fragment.append(text.substring(consumed));
      node.replaceWith(fragment);
    }
    return total;
  }

  /** Makes the hit at `hitIndex` the current one and brings it into view. */
  showFindHit(hitIndex: number): void {
    const hits = Array.from(this.content.querySelectorAll('mark.lm-find'));
    hits.forEach((hit, index) => hit.classList.toggle('is-current', index === hitIndex));
    hits[hitIndex]?.scrollIntoView({ block: 'center' });
  }

  clearFind(): void {
    for (const hit of Array.from(this.content.querySelectorAll('mark.lm-find'))) {
      const parent = hit.parentNode;
      hit.replaceWith(document.createTextNode(hit.textContent ?? ''));
      parent?.normalize();
    }
  }

  headings(): HTMLElement[] {
    return Array.from(this.content.querySelectorAll<HTMLElement>(':scope > h2, :scope > h3'));
  }

  /** Id of the h2/h3 section at the top of the viewport. */
  currentHeadingId(): string {
    const threshold = this.scroller.getBoundingClientRect().top + 96;
    let currentId = '';
    for (const heading of this.headings()) {
      if (heading.getBoundingClientRect().top > threshold) break;
      currentId = heading.id;
    }
    return currentId;
  }

  /** Distinct links that lead out of this document, in order of appearance. */
  outgoingLinks(): Array<{ href: string; text: string }> {
    const links = new Map<string, string>();
    for (const link of Array.from(this.content.querySelectorAll('a[href]'))) {
      const href = link.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || links.has(href)) continue;
      links.set(href, link.textContent?.trim() || href);
    }
    return Array.from(links, ([href, text]) => ({ href, text }));
  }
}
