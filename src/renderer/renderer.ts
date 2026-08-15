import markdownit from 'markdown-it';
import hljs from 'highlight.js';
import TurndownService from 'turndown';
import { installLiveMarkBridge, type DocumentSnapshot } from './platform';

interface OpenDocument extends DocumentSnapshot {
  updateCount: number;
  scrollTop: number;
}

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

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

function formatDate(date: number): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function basename(filePath: string): string {
  const cleaned = filePath.replace(/\\/g, '/');
  const lastSlash = cleaned.lastIndexOf('/');
  return lastSlash >= 0 ? cleaned.substring(lastSlash + 1) : cleaned;
}

const THEME_KEY = 'livemark-theme';
const livemark = installLiveMarkBridge();

function applyTheme(dark: boolean): void {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

(function initTheme(): void {
  const stored = localStorage.getItem(THEME_KEY);
  applyTheme(stored === 'dark');
})();

document.addEventListener('DOMContentLoaded', () => {
  const contentEl = document.getElementById('content') as HTMLElement;
  const filePathEl = document.getElementById('file-path') as HTMLElement;
  const lastUpdatedEl = document.getElementById('last-updated') as HTMLElement;
  const metadataEl = document.getElementById('document-metadata') as HTMLElement;
  const emptyStateEl = document.getElementById('empty-state') as HTMLElement;
  const openFileBtn = document.getElementById('open-file-btn') as HTMLButtonElement;
  const notificationEl = document.getElementById('update-notification') as HTMLElement;
  const updateCountEl = document.getElementById('update-count') as HTMLElement;
  const screenFlashEl = document.getElementById('screen-flash') as HTMLElement;
  const themeToggleInput = document.getElementById('theme-toggle-input') as HTMLInputElement;
  const tabsWrapperEl = document.getElementById('document-tabs-wrapper') as HTMLElement;
  const tabsEl = document.getElementById('document-tabs') as HTMLElement;
  const appVersionEl = document.getElementById('app-version') as HTMLElement;

  const documents = new Map<string, OpenDocument>();
  let activeDocumentId: string | null = null;
  let notificationTimer: number | null = null;
  let flashTimer: number | null = null;

  themeToggleInput.checked = localStorage.getItem(THEME_KEY) === 'dark';
  themeToggleInput.addEventListener('change', () => {
    const dark = themeToggleInput.checked;
    applyTheme(dark);
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  });

  const defaultImageRenderer = md.renderer.rules.image || ((tokens, idx, options, _, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet('src');
    if (src && !/^(https?:\/\/|data:)/i.test(src) && activeDocumentId) {
      token.attrSet('data-livemark-source', src);
      token.attrSet('src', 'data:,');
    }
    return defaultImageRenderer(tokens, idx, options, env, self);
  };

  function showNotification(message: string, duration: number, flash: boolean): void {
    if (notificationTimer !== null) {
      window.clearTimeout(notificationTimer);
    }
    notificationEl.textContent = message;
    notificationEl.classList.add('show');
    notificationTimer = window.setTimeout(() => {
      notificationEl.classList.remove('show');
      notificationEl.textContent = 'Updated';
      notificationTimer = null;
    }, duration);

    if (!flash) return;
    if (flashTimer !== null) {
      window.clearTimeout(flashTimer);
    }
    screenFlashEl.classList.add('flash');
    flashTimer = window.setTimeout(() => {
      screenFlashEl.classList.remove('flash');
      flashTimer = null;
    }, 150);
  }

  function saveActiveScrollPosition(): void {
    if (!activeDocumentId) return;
    const activeDocument = documents.get(activeDocumentId);
    if (activeDocument) {
      activeDocument.scrollTop = window.scrollY;
    }
  }

  function focusTab(documentId: string): void {
    const tab = Array.from(tabsEl.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((candidate) => candidate.dataset.documentId === documentId);
    tab?.focus();
  }

  function requestDocumentActivation(documentId: string, moveFocus = false): void {
    if (!documents.has(documentId)) return;
    activateDocument(documentId);
    void livemark.activateDocument(documentId);
    if (moveFocus) {
      focusTab(documentId);
    }
  }

  function renderTabs(): void {
    tabsEl.replaceChildren();
    tabsWrapperEl.hidden = documents.size === 0;
    document.body.classList.toggle('has-documents', documents.size > 0);

    let index = 0;
    for (const documentState of documents.values()) {
      const isActive = documentState.id === activeDocumentId;
      const name = basename(documentState.path);
      const tabItem = document.createElement('div');
      tabItem.className = `document-tab${isActive ? ' is-active' : ''}`;

      const tabButton = document.createElement('button');
      tabButton.type = 'button';
      tabButton.id = `document-tab-${index}`;
      tabButton.className = 'document-tab__button';
      tabButton.dataset.documentId = documentState.id;
      tabButton.setAttribute('role', 'tab');
      tabButton.setAttribute('aria-controls', 'content');
      tabButton.setAttribute('aria-selected', String(isActive));
      tabButton.tabIndex = isActive ? 0 : -1;
      tabButton.title = documentState.path;
      tabButton.setAttribute(
        'aria-label',
        documentState.updateCount > 0 ? `${name}, ${documentState.updateCount} updates` : name
      );
      tabButton.addEventListener('click', () => requestDocumentActivation(documentState.id));

      const label = document.createElement('span');
      label.className = 'document-tab__label';
      label.textContent = name;
      tabButton.appendChild(label);

      if (documentState.updateCount > 0) {
        const count = document.createElement('span');
        count.className = 'document-tab__count';
        count.textContent = String(documentState.updateCount);
        count.setAttribute('aria-hidden', 'true');
        tabButton.appendChild(count);
      }

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'document-tab__close';
      closeButton.textContent = '×';
      closeButton.title = `Close ${name}`;
      closeButton.setAttribute('aria-label', `Close ${name}`);
      closeButton.addEventListener('click', () => void livemark.closeDocument(documentState.id));

      tabItem.append(tabButton, closeButton);
      tabsEl.appendChild(tabItem);
      index++;
    }
  }

  function showEmptyState(): void {
    contentEl.innerHTML = '';
    contentEl.style.display = 'none';
    contentEl.removeAttribute('aria-labelledby');
    emptyStateEl.style.display = 'block';
    filePathEl.textContent = '';
    lastUpdatedEl.textContent = '';
    updateCountEl.textContent = '';
    metadataEl.hidden = true;
    window.scrollTo(0, 0);
  }

  function renderActiveDocument(): void {
    if (!activeDocumentId) {
      showEmptyState();
      return;
    }

    const activeDocument = documents.get(activeDocumentId);
    if (!activeDocument) {
      activeDocumentId = null;
      showEmptyState();
      return;
    }

    metadataEl.hidden = false;
    contentEl.innerHTML = md.render(activeDocument.content);
    const renderedDocumentId = activeDocument.id;
    for (const image of Array.from(contentEl.querySelectorAll<HTMLImageElement>('img'))) {
      const source = image.dataset.livemarkSource ?? image.getAttribute('src');
      if (!source || /^(https?:\/\/|data:)/i.test(source)) continue;
      image.src = 'data:,';
      void livemark.resolveLocalImage(renderedDocumentId, source).then((dataUrl) => {
        if (activeDocumentId === renderedDocumentId && image.isConnected) {
          image.src = dataUrl;
        }
      }).catch(() => {
        image.removeAttribute('src');
      });
    }
    contentEl.style.display = 'block';
    contentEl.setAttribute('aria-labelledby', `document-tab-${Array.from(documents.keys()).indexOf(activeDocument.id)}`);
    emptyStateEl.style.display = 'none';
    filePathEl.textContent = activeDocument.path;
    lastUpdatedEl.textContent = `Last updated: ${formatDate(activeDocument.lastModified)}`;
    updateCountEl.textContent = activeDocument.updateCount > 0 ? `Updates: ${activeDocument.updateCount}` : '';

    window.requestAnimationFrame(() => {
      window.scrollTo(0, activeDocument.scrollTop);
    });
  }

  function activateDocument(documentId: string): void {
    if (!documents.has(documentId)) return;
    if (activeDocumentId !== documentId) {
      saveActiveScrollPosition();
      activeDocumentId = documentId;
    }
    renderTabs();
    renderActiveDocument();
  }

  tabsEl.addEventListener('keydown', (event) => {
    const target = (event.target as HTMLElement).closest('[role="tab"]') as HTMLButtonElement | null;
    if (!target) return;

    const documentIds = Array.from(documents.keys());
    const currentIndex = documentIds.indexOf(target.dataset.documentId ?? '');
    if (currentIndex < 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % documentIds.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + documentIds.length) % documentIds.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = documentIds.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      requestDocumentActivation(documentIds[nextIndex], true);
    }
  });

  function upsertDocument(snapshot: DocumentSnapshot, countAsUpdate: boolean): void {
    const existingDocument = documents.get(snapshot.id);
    if (existingDocument) {
      if (snapshot.id === activeDocumentId) {
        existingDocument.scrollTop = window.scrollY;
      }
      existingDocument.path = snapshot.path;
      existingDocument.content = snapshot.content;
      existingDocument.lastModified = snapshot.lastModified;
      if (countAsUpdate) {
        existingDocument.updateCount++;
      }
      renderTabs();

      if (countAsUpdate && snapshot.id === activeDocumentId) {
        renderActiveDocument();
        showNotification('Updated', 1500, true);
      }
      return;
    }

    documents.set(snapshot.id, {
      ...snapshot,
      updateCount: 0,
      scrollTop: 0,
    });
    renderTabs();
  }

  livemark.onDocumentUpdate((snapshot: DocumentSnapshot) => {
    upsertDocument(snapshot, true);
  });

  livemark.onDocumentActivated(({ id }) => {
    activateDocument(id);
  });

  livemark.onDocumentClosed(({ id }) => {
    const documentIds = Array.from(documents.keys());
    const closingIndex = documentIds.indexOf(id);
    const wasActive = activeDocumentId === id;
    documents.delete(id);

    if (wasActive) {
      const remainingIds = Array.from(documents.keys());
      activeDocumentId = remainingIds[Math.min(closingIndex, remainingIds.length - 1)] ?? null;
    }

    renderTabs();
    renderActiveDocument();
    if (activeDocumentId) {
      window.requestAnimationFrame(() => focusTab(activeDocumentId as string));
    }
  });

  document.addEventListener('copy', (event) => {
    if (!activeDocumentId) return;
    const activeDocument = documents.get(activeDocumentId);
    if (!activeDocument?.content) return;
    event.preventDefault();

    const selection = window.getSelection();
    let textToCopy = activeDocument.content;

    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      if (contentEl.contains(range.commonAncestorContainer)) {
        const fragment = range.cloneContents();
        const temporaryContainer = document.createElement('div');
        temporaryContainer.appendChild(fragment);
        textToCopy = turndown.turndown(temporaryContainer.innerHTML);
      }
    }

    event.clipboardData?.setData('text/plain', textToCopy);
    showNotification('Markdown copied to clipboard', 1000, false);
  });

  openFileBtn.addEventListener('click', () => {
    void livemark.openFile();
  });

  livemark.onFileDrop((filePaths) => {
    if (filePaths.length > 0) {
      void livemark.openFilePaths(filePaths);
    }
  });

  void livemark.bootstrap().then((state) => {
    appVersionEl.textContent = `v${state.version}`;
    for (const snapshot of state.documents) {
      upsertDocument(snapshot, false);
    }
    if (state.activeDocumentId) {
      activateDocument(state.activeDocumentId);
    }
  });
});
