import { htmlToPlainText, markdownForCopy, selectionCoversElement } from './copy-markdown';
import { renderMarkdown } from './markdown';
import { DOCUMENT_DRAG_TYPE, DocumentPane, type PaneHost } from './pane';
import { installLiveMarkBridge, type DocumentSnapshot } from './platform';
import {
  MOVABLE_SECTIONS,
  SECTION_ORDER,
  otherPanel,
  parseLayout,
  resolvePlacement,
  type CollapsibleSection,
  type DetailsState,
  type MovableSection,
  type PanelId,
} from './panels';
import { DETAILS_WIDTH, RAIL_WIDTH_DEFAULT, RAIL_WIDTH_MAX, RAIL_WIDTH_MIN, dockedRailWidth, railWidthLimit } from './rail-width';
import { applyStaticStrings, t, tCount } from './strings';
import { initUpdates } from './updates';
import { diffReload, fuzzyScore, indexBlocks, isReloadOnScreen, type BlockIndex, type ReloadEntry } from './reloads';

interface OpenDocument extends DocumentSnapshot {
  updateCount: number;
  openedAt: number;
  reloads: ReloadEntry[];
  blockIndex: BlockIndex;
  changedSections: Set<string>;
  /** Which reload's blocks are marked, and until when the marks are highlighted. */
  markedReload: number;
  marksUntil: number;
  paused: boolean;
  /** Newest snapshot received while paused, and how many arrived. */
  held: DocumentSnapshot | null;
  waiting: number;
  missing: boolean;
}

interface ReloadSettings {
  markBlocks: boolean;
  fadeMarks: boolean;
  notifyAll: boolean;
}

interface PaletteEntry {
  path: string;
  open: boolean;
}

const MARK_DURATION_MS = 8000;
const RELOADED_FLASH_MS = 1500;
const EDITING_WINDOW_MS = 10000;
const EDITING_THRESHOLD = 3;
const MIN_SPLIT_WIDTH = 1180;
const MARGIN_COLUMN_QUERY = '(min-width: 1141px)';
/** Rail (232) + workspace and page padding (128) + the 680px measure. Narrower than this, the rail would crush the document. */
const RAIL_COLLAPSE_QUERY = '(max-width: 1039px)';
const DETAILS_STRIP_WIDTH = 44;
const PANELS_KEY = 'livemark-panels';
const SECTION_DRAG_TYPE = 'application/x-livemark-section';
/** Scrolled this far, the document title is out of sight and the title bar names the file and section. */
const CRUMB_SCROLL_THRESHOLD = 120;
const RECENT_RELOADS = 3;
const THEME_KEY = 'livemark-theme';
const SETTINGS_KEY = 'livemark-reload-settings';
const TEXT_ZOOM_KEY = 'livemark-text-zoom';
const TEXT_ZOOM_STEP = 10;
const TEXT_ZOOM_MIN = 50;
const TEXT_ZOOM_MAX = 300;
const CLOSE_ICON = '<svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 4l7 7M11 4l-7 7"></path></svg>';

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

function formatTime(date: number, withSeconds: boolean): string {
  const full = formatDate(date).substring(11);
  return withSeconds ? full : full.substring(0, 5);
}

function formatModified(date: number): string {
  return new Date(date).toDateString() === new Date().toDateString() ? formatTime(date, true) : formatDate(date);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function basename(filePath: string): string {
  const cleaned = normalizePath(filePath);
  return cleaned.substring(cleaned.lastIndexOf('/') + 1);
}

function dirname(filePath: string): string {
  const cleaned = normalizePath(filePath);
  return cleaned.substring(0, Math.max(cleaned.lastIndexOf('/'), 0)) || '/';
}

function shortenHome(filePath: string): string {
  return filePath.replace(/^\/Users\/[^/]+/, '~');
}

function loadSettings(): ReloadSettings {
  const defaults: ReloadSettings = { markBlocks: true, fadeMarks: true, notifyAll: false };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

const livemark = installLiveMarkBridge();

document.documentElement.dataset.platform = /Windows/.test(navigator.userAgent) ? 'windows' : 'mac';

function applyTheme(dark: boolean): void {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

(function initTheme(): void {
  const stored = localStorage.getItem(THEME_KEY);
  applyTheme(stored === 'dark');
})();

document.addEventListener('DOMContentLoaded', () => {
  applyStaticStrings();
  const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
  const workspaceEl = byId('workspace');
  const panesEl = byId('panes');
  const marginColumnEl = byId('margin-column');
  const emptyStateEl = byId('empty-state');
  const tabsEl = byId('document-tabs');
  const railHeadingEl = byId('rail-heading');
  const statusEl = byId('live-status');
  const allReloadsBtn = byId<HTMLButtonElement>('all-reloads-btn');
  const railEl = byId('rail');
  const railToggle = byId<HTMLButtonElement>('rail-toggle');
  const railToggleLabel = byId('rail-toggle-label');
  const railSlotsEl = byId('rail-slots');
  const detailsSlotsEl = byId('details-slots');
  const detailsStripEl = byId('details-strip');
  const detailsStripCountEl = byId('details-strip-count');
  const detailsShowBtn = byId<HTMLButtonElement>('details-show-btn');
  const changesSectionEl = byId('changes-section');
  const changesSummaryEl = byId('changes-summary');
  const outlineSummaryEl = byId('outline-summary');
  const outlineLegendEl = byId('outline-legend');
  const railCountEl = byId('rail-count');
  const railMiniEl = byId('rail-mini');
  const railMiniVersionEl = byId('rail-mini-version');
  const railMiniUpdateBtn = byId<HTMLButtonElement>('rail-mini-update');
  const railMiniUpdateTextEl = byId('rail-mini-update-text');
  const railMiniThemeBtn = byId<HTMLButtonElement>('rail-mini-theme');
  const updateBannerEl = byId('app-update-banner');
  const updateTextEl = byId('app-update-text');
  const crumbEl = byId('workspace-crumb');
  const crumbNameEl = byId('workspace-crumb-name');
  const crumbSectionEl = byId('workspace-crumb-section');
  const sectionEls: Record<MovableSection, HTMLElement> = { changes: changesSectionEl, outline: byId('outline') };
  const slotEls: Record<PanelId, HTMLElement> = { rail: railSlotsEl, details: detailsSlotsEl };
  const findBarEl = byId('find-bar');
  const findInput = byId<HTMLInputElement>('find-input');
  const findCountEl = byId('find-count');
  const statusLabelEl = byId('live-status-label');
  const statusDetailEl = byId('live-status-detail');
  const statusActionBtn = byId<HTMLButtonElement>('status-action-btn');
  const statusActionKbd = byId('status-action-kbd');
  const pauseBtn = byId<HTMLButtonElement>('pause-btn');
  const popoverEl = byId('history-popover');
  const historySinceEl = byId('history-since');
  const historyListEl = byId('history-list');
  const paletteEl = byId('palette');
  const paletteInput = byId<HTMLInputElement>('palette-input');
  const paletteListEl = byId('palette-list');
  const aboutEl = byId('about-dialog');
  const aboutCardEl = aboutEl.querySelector('.about__card') as HTMLElement;
  const aboutVersionEl = byId('about-version');
  const aboutCloseBtn = byId<HTMLButtonElement>('about-close-btn');
  const tabMenuEl = byId('tab-menu');
  const tabMenuCopyBtn = byId<HTMLButtonElement>('tab-menu-copy-path');
  const tabMenuFolderBtn = byId<HTMLButtonElement>('tab-menu-open-folder');
  let tabMenuDocumentId: string | null = null;
  /** One-shot plain text for the next copy event, so a path copy is not replaced by document Markdown. */
  let plainClipboard: string | null = null;
  const toastEl = byId('update-notification');
  const toastTitleEl = byId('toast-title');
  const toastDetailEl = byId('toast-detail');
  const toastViewBtn = byId<HTMLButtonElement>('toast-view-btn');
  const outlineEl = byId('outline');
  const outlineListEl = byId('outline-list');
  const reloadLogListEl = byId('reload-log-list');
  const linksOutEl = byId('links-out');
  const linksOutListEl = byId('links-out-list');
  const themeToggleInput = byId<HTMLInputElement>('theme-toggle-input');
  const updates = initUpdates();

  const documents = new Map<string, OpenDocument>();
  const settings = loadSettings();
  let split = false;
  let focusedPaneIndex = 0;
  let toastTimer: number | null = null;
  let toastTarget: string | null = null;
  let statusTimer: number | null = null;
  let reloadedFlashUntil = 0;
  let paletteEntries: PaletteEntry[] = [];
  let paletteSelection = 0;
  let paletteReturnFocus: HTMLElement | null = null;
  let findTotal = 0;
  let findIndex = 0;
  let draggedDocumentId: string | null = null;
  const marginColumnMedia = window.matchMedia(MARGIN_COLUMN_QUERY);
  const railCollapseMedia = window.matchMedia(RAIL_COLLAPSE_QUERY);
  const panelLayout = parseLayout(localStorage.getItem(PANELS_KEY));
  let draggedSection: MovableSection | null = null;

  function savePanelLayout(): void {
    localStorage.setItem(PANELS_KEY, JSON.stringify(panelLayout));
  }

  /** The rail is out of the layout when the window is too narrow or the user hid it. */
  const railCollapsed = (): boolean => railCollapseMedia.matches || panelLayout.railHidden;

  function detailsState(): DetailsState {
    if (!marginColumnMedia.matches || split || documents.size === 0) return 'unavailable';
    return panelLayout.detailsHidden ? 'strip' : 'shown';
  }

  function detailsWidth(): number {
    const state = detailsState();
    return state === 'shown' ? DETAILS_WIDTH : state === 'strip' ? DETAILS_STRIP_WIDTH : 0;
  }

  // Below the collapse width the rail leaves the layout. Opening it covers the document
  // instead of pushing it, so the 680px measure stays intact.
  function setRailOpen(open: boolean): void {
    const collapsed = railCollapsed();
    const shown = collapsed && open;
    document.documentElement.classList.toggle('is-rail-open', shown);
    railToggle.setAttribute('aria-expanded', String(shown));
    const label = t(shown ? 'rail.hide' : 'rail.show');
    railToggle.title = label;
    railToggle.setAttribute('aria-label', label);
    railToggleLabel.textContent = shown
      ? t('rail.hideShort')
      : documents.size > 1
        ? t('rail.documentsCount', { count: documents.size })
        : t('rail.documents');
    railEl.toggleAttribute('inert', collapsed && !shown);
    document.documentElement.classList.toggle('is-rail-hidden', panelLayout.railHidden && !railCollapseMedia.matches);
    railMiniEl.hidden = !collapsed || shown;
  }

  const RAIL_WIDTH_KEY = 'livemark.railWidth';
  const railResize = byId('rail-resize');
  let railPreferred = readRailPreferred();

  function readRailPreferred(): number {
    const stored = Number(localStorage.getItem(RAIL_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : RAIL_WIDTH_DEFAULT;
  }

  function layoutDockedRail(): void {
    if (railCollapsed()) {
      document.documentElement.style.removeProperty('--rail-width');
      return;
    }
    const width = dockedRailWidth(railPreferred, window.innerWidth, detailsWidth());
    document.documentElement.style.setProperty('--rail-width', `${width}px`);
    railResize.setAttribute('aria-valuemin', String(RAIL_WIDTH_MIN));
    railResize.setAttribute('aria-valuemax', String(Math.min(RAIL_WIDTH_MAX, railWidthLimit(window.innerWidth, detailsWidth()))));
    railResize.setAttribute('aria-valuenow', String(width));
  }

  function setRailPreferred(next: number): void {
    railPreferred = Math.round(Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, next)));
    localStorage.setItem(RAIL_WIDTH_KEY, String(railPreferred));
    layoutDockedRail();
  }

  railResize.addEventListener('pointerdown', (event) => {
    if (railCollapsed() || event.button !== 0) return;
    event.preventDefault();
    const originX = event.clientX;
    const originWidth = railEl.getBoundingClientRect().width;
    railEl.classList.add('is-resizing');
    document.body.classList.add('is-rail-resizing');
    try {
      railResize.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that cannot be captured still receives move events on the handle.
    }

    function move(moveEvent: PointerEvent): void {
      setRailPreferred(originWidth + (moveEvent.clientX - originX));
    }
    function stop(stopEvent: PointerEvent): void {
      if (railResize.hasPointerCapture(stopEvent.pointerId)) railResize.releasePointerCapture(stopEvent.pointerId);
      railResize.removeEventListener('pointermove', move);
      railResize.removeEventListener('pointerup', stop);
      railResize.removeEventListener('pointercancel', stop);
      railEl.classList.remove('is-resizing');
      document.body.classList.remove('is-rail-resizing');
    }
    railResize.addEventListener('pointermove', move);
    railResize.addEventListener('pointerup', stop);
    railResize.addEventListener('pointercancel', stop);
  });
  railResize.addEventListener('dblclick', () => setRailPreferred(RAIL_WIDTH_DEFAULT));
  railResize.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 32 : 16;
    if (event.key === 'ArrowRight') setRailPreferred(railPreferred + step);
    else if (event.key === 'ArrowLeft') setRailPreferred(railPreferred - step);
    else if (event.key === 'Home') setRailPreferred(RAIL_WIDTH_DEFAULT);
    else return;
    event.preventDefault();
  });
  layoutDockedRail();

  const paneHost: PaneHost = {
    livemark,
    imageCache: new Map(),
    onFocus: (pane) => focusPane(pane.index),
    onScroll: (pane) => {
      if (pane.index !== focusedPaneIndex) return;
      updateScrollSpy();
      workspaceEl.classList.toggle('is-scrolled', pane.scroller.scrollTop > 0);
      updateCrumb();
    },
    onClosePane: (pane) => setSplit(false, pane.index === 0 ? 1 : 0),
    onDropDocument: (pane, documentId) => showInPane(pane.index, documentId),
    onLinkFailed: (href) => showToast(t('toast.linkFailed'), href, 3000, null),
  };
  const panes = [new DocumentPane(0, paneHost), new DocumentPane(1, paneHost)];
  panesEl.append(panes[0].element, panes[1].element);

  const focusedPane = (): DocumentPane => panes[focusedPaneIndex];
  const visiblePanes = (): DocumentPane[] => (split ? panes : [panes[0]]);
  const getActiveDocument = (): OpenDocument | null => {
    const documentId = focusedPane().documentId;
    return documentId ? documents.get(documentId) ?? null : null;
  };
  const paneShowing = (documentId: string): DocumentPane | undefined =>
    visiblePanes().find((pane) => pane.documentId === documentId);

  // Rail order: grouped by folder when documents come from more than one, otherwise the order they were opened in.
  function documentGroups(): Array<{ folder: string; documents: OpenDocument[] }> {
    const groups = new Map<string, OpenDocument[]>();
    for (const documentState of documents.values()) {
      const folder = dirname(documentState.path);
      groups.set(folder, [...(groups.get(folder) ?? []), documentState]);
    }
    return Array.from(groups, ([folder, grouped]) => ({ folder, documents: grouped }));
  }

  const visualOrder = (): string[] => documentGroups().flatMap((group) => group.documents.map((entry) => entry.id));

  function showToast(title: string, detail: string, duration: number, viewDocumentId: string | null): void {
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
    }
    toastTitleEl.textContent = title;
    toastDetailEl.textContent = detail;
    toastTarget = viewDocumentId;
    toastViewBtn.hidden = viewDocumentId === null;
    toastEl.classList.add('show');
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('show');
      toastTimer = null;
    }, duration);
  }

  function markRequest(documentState: OpenDocument) {
    const reload = documentState.reloads[documentState.markedReload];
    if (!reload) return null;
    return {
      keys: reload.keys,
      label: tCount('mark.label', reload.blocks, { time: formatTime(reload.time, true) }),
      visibleUntil: documentState.marksUntil,
    };
  }

  function applyMarks(pane: DocumentPane): void {
    const documentState = pane.documentId ? documents.get(pane.documentId) : null;
    pane.applyMarks(documentState ? markRequest(documentState) : null, settings.markBlocks);
  }

  function jumpToReload(documentState: OpenDocument, reloadIndex: number): void {
    const pane = paneShowing(documentState.id);
    if (!pane) return;
    documentState.markedReload = reloadIndex;
    documentState.marksUntil = settings.fadeMarks ? Date.now() + MARK_DURATION_MS : Infinity;
    applyMarks(pane);
    if (!pane.scrollToMarks()) {
      showToast(t('toast.changeGone'), '', 2500, null);
    }
    renderHistory();
  }

  // Steps from the newest reload to older ones whose blocks still exist, then wraps around.
  function stepThroughChanges(): void {
    const documentState = getActiveDocument();
    if (!documentState) return;
    const candidates = documentState.reloads
      .map((reload, reloadIndex) => (isReloadOnScreen(reload, documentState.blockIndex) ? reloadIndex : -1))
      .filter((reloadIndex) => reloadIndex >= 0);
    if (candidates.length === 0) {
      showToast(t('toast.noChanges'), '', 2000, null);
      return;
    }
    const stepping = Date.now() < documentState.marksUntil;
    const next = stepping ? candidates.find((reloadIndex) => reloadIndex > documentState.markedReload) : undefined;
    jumpToReload(documentState, next ?? candidates[0]);
  }

  function clearAllMarks(): void {
    const documentState = getActiveDocument();
    if (!documentState) return;
    documentState.marksUntil = 0;
    documentState.changedSections.clear();
    for (const pane of visiblePanes()) {
      if (pane.documentId === documentState.id) pane.clearMarks();
    }
    renderMarginColumn();
    renderHistory();
  }

  function setPaused(documentState: OpenDocument, paused: boolean): void {
    documentState.paused = paused;
    const held = documentState.held;
    documentState.held = null;
    documentState.waiting = 0;
    if (!paused && held) {
      applyUpdate(documentState, held);
    }
    updateStatus();
  }

  // Navigation sits in the rail and activity in the right panel by default; the user can move either section.
  function placeSections(): void {
    const state = detailsState();
    const root = document.documentElement;
    root.classList.toggle('has-details', state === 'shown');
    root.classList.toggle('has-details-strip', state === 'strip');
    marginColumnEl.hidden = state !== 'shown';
    detailsStripEl.hidden = state !== 'strip';
    root.style.setProperty('--details-offset', `${detailsWidth()}px`);

    const placement = resolvePlacement(panelLayout, state);
    for (const panel of ['rail', 'details'] as PanelId[]) {
      for (const section of SECTION_ORDER[panel]) {
        if (placement[section] === panel && sectionEls[section].parentElement !== slotEls[panel]) {
          slotEls[panel].appendChild(sectionEls[section]);
        }
      }
      // Keep the panel's own order regardless of the order sections arrived in.
      for (const section of SECTION_ORDER[panel]) {
        if (sectionEls[section].parentElement === slotEls[panel]) slotEls[panel].appendChild(sectionEls[section]);
      }
    }
    for (const section of MOVABLE_SECTIONS) {
      const element = sectionEls[section];
      const shownIn = placement[section];
      element.classList.toggle('is-parked', shownIn === null);
      const grip = element.querySelector('.panel-section__grip') as HTMLButtonElement;
      const name = (element.querySelector('.panel-section__title') as HTMLElement).textContent ?? '';
      const target = otherPanel(shownIn ?? panelLayout.place[section]);
      const label = t(target === 'rail' ? 'section.moveToRail' : 'section.moveToDetails', { name });
      grip.setAttribute('aria-label', label);
      // With nowhere to move to, the grip keeps its place in the header but cannot be used.
      grip.disabled = state !== 'shown';
    }
    layoutDockedRail();
  }

  function moveSection(section: MovableSection, panel: PanelId): void {
    panelLayout.place[section] = panel;
    if (panel === 'details') panelLayout.detailsHidden = false;
    else if (panelLayout.railHidden) panelLayout.railHidden = false;
    savePanelLayout();
    setPopoverOpen(false);
    placeSections();
    setRailOpen(false);
  }

  function setSectionCollapsed(section: CollapsibleSection, collapsed: boolean): void {
    panelLayout.collapsed[section] = collapsed;
    savePanelLayout();
    applyCollapsedSections();
    if (section === 'changes' && collapsed) setPopoverOpen(false);
  }

  function applyCollapsedSections(): void {
    for (const sectionEl of Array.from(document.querySelectorAll<HTMLElement>('.panel-section[data-section]'))) {
      const section = sectionEl.dataset.section as CollapsibleSection;
      const collapsed = panelLayout.collapsed[section] ?? false;
      sectionEl.classList.toggle('is-collapsed', collapsed);
      sectionEl.querySelector('.panel-section__toggle')?.setAttribute('aria-expanded', String(!collapsed));
    }
  }

  function setRailHidden(hidden: boolean): void {
    panelLayout.railHidden = hidden;
    savePanelLayout();
    setRailOpen(false);
    layoutDockedRail();
  }

  function setDetailsHidden(hidden: boolean): void {
    panelLayout.detailsHidden = hidden;
    savePanelLayout();
    setPopoverOpen(false);
    placeSections();
  }

  /** Once the title has scrolled away, the title bar names the file and the section being read. */
  function updateCrumb(): void {
    const pane = focusedPane();
    const documentState = pane.documentId ? documents.get(pane.documentId) : null;
    const show = !split && !!documentState && pane.scroller.scrollTop > CRUMB_SCROLL_THRESHOLD;
    crumbEl.hidden = !show;
    if (!show || !documentState) return;
    crumbNameEl.textContent = basename(documentState.path);
    const currentId = pane.currentHeadingId();
    const heading = currentId ? pane.headings().find((candidate) => candidate.id === currentId) : undefined;
    crumbSectionEl.textContent = heading?.textContent ?? '';
    crumbEl.classList.toggle('has-section', !!heading);
  }

  function updateStatus(): void {
    if (statusTimer !== null) {
      window.clearTimeout(statusTimer);
      statusTimer = null;
    }
    const documentState = getActiveDocument();
    changesSectionEl.hidden = !documentState;
    byId('watching-count').textContent = tCount('rail.watching', documents.size);
    if (!documentState) {
      setPopoverOpen(false);
      return;
    }

    const now = Date.now();
    const newest = documentState.reloads[0];
    const opened = formatTime(documentState.openedAt, false);
    let state = 'idle';
    let label = t('status.idle');
    let detail = newest
      ? t('status.sinceOpened', { opened, last: formatTime(newest.time, true) })
      : t('status.opened', { time: opened });
    let action: 'jump' | 'locate' | 'load' | null = newest ? 'jump' : null;

    if (documentState.missing) {
      state = 'missing';
      label = t('status.missing');
      detail = t('status.showing', { time: formatModified(documentState.lastModified) });
      action = 'locate';
    } else if (documentState.paused) {
      state = 'paused';
      label = documentState.waiting > 0 ? tCount('status.pausedWaiting', documentState.waiting) : t('status.paused');
      detail = t('status.scrollPreserved');
      action = documentState.waiting > 0 ? 'load' : null;
    } else if (newest && now < reloadedFlashUntil) {
      state = 'reloaded';
      label = t('status.reloaded', { time: formatTime(newest.time, true) });
      statusTimer = window.setTimeout(updateStatus, reloadedFlashUntil - now);
    } else if (newest) {
      const burstStart = documentState.reloads[EDITING_THRESHOLD - 1]?.time ?? 0;
      if (now - burstStart < EDITING_WINDOW_MS) {
        state = 'editing';
        label = tCount('status.editing', documentState.updateCount);
        statusTimer = window.setTimeout(updateStatus, burstStart + EDITING_WINDOW_MS - now);
      } else {
        state = 'count';
        label = tCount('status.count', documentState.updateCount);
      }
    }

    statusEl.dataset.state = state;
    statusEl.dataset.action = action ?? '';
    statusLabelEl.textContent = label;
    statusDetailEl.textContent = detail;
    statusActionBtn.textContent = action === 'locate' ? t('status.locate') : action === 'load' ? t('status.loadNow') : t('status.jump');
    statusActionBtn.hidden = action === null;
    statusActionKbd.hidden = action !== 'jump';
    pauseBtn.textContent = t(documentState.paused ? 'status.resume' : 'status.pause');
    pauseBtn.hidden = documentState.missing;
    changesSectionEl.dataset.state = state;
    changesSummaryEl.textContent = state === 'missing' ? label : String(documentState.updateCount);
    detailsStripCountEl.textContent = String(documentState.updateCount);
    detailsStripEl.dataset.state = state;
    detailsShowBtn.title = t('details.show');
    detailsShowBtn.setAttribute('aria-label', t('details.showWithStatus', { status: label }));

    reloadLogListEl.replaceChildren();
    reloadLogListEl.hidden = documentState.reloads.length === 0;
    allReloadsBtn.hidden = documentState.reloads.length === 0;
    documentState.reloads.slice(0, RECENT_RELOADS).forEach((reload, reloadIndex) => {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.className = 'reload-entry';
      entry.disabled = !isReloadOnScreen(reload, documentState.blockIndex);
      entry.addEventListener('click', () => jumpToReload(documentState, reloadIndex));
      const time = document.createElement('span');
      time.className = 'reload-entry__time';
      time.textContent = formatTime(reload.time, false);
      const text = document.createElement('span');
      text.className = 'reload-entry__text';
      text.textContent = reload.text;
      entry.append(time, text);
      reloadLogListEl.appendChild(entry);
    });
  }

  function renderHistory(): void {
    if (popoverEl.hidden) return;
    const documentState = getActiveDocument();
    historyListEl.replaceChildren();
    if (!documentState) return;
    historySinceEl.textContent = t('history.since', { time: formatTime(documentState.openedAt, false) });

    if (documentState.reloads.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = t('history.empty');
      historyListEl.appendChild(empty);
      return;
    }

    documentState.reloads.forEach((reload, reloadIndex) => {
      const onScreen = isReloadOnScreen(reload, documentState.blockIndex);
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.className = 'history-entry';
      entry.disabled = !onScreen;
      const marked = reloadIndex === documentState.markedReload && Date.now() < documentState.marksUntil;
      entry.classList.toggle('is-current', marked);

      const time = document.createElement('span');
      time.className = 'history-entry__time';
      time.textContent = formatTime(reload.time, false);
      const body = document.createElement('span');
      body.className = 'history-entry__body';
      const text = document.createElement('span');
      text.className = 'history-entry__text';
      text.textContent = reload.text;
      const stateLine = document.createElement('span');
      stateLine.className = 'history-entry__state';
      stateLine.textContent = !onScreen
        ? t(reload.blocks === 0 ? 'history.nothing' : 'history.gone')
        : t(reloadIndex === 0 ? 'history.onScreenNow' : 'history.stillOnScreen');
      body.append(text, stateLine);
      const blocks = document.createElement('span');
      blocks.className = 'history-entry__blocks';
      blocks.textContent = tCount('history.blocks', reload.blocks);

      entry.append(time, body, blocks);
      entry.addEventListener('click', () => jumpToReload(documentState, reloadIndex));
      historyListEl.appendChild(entry);
    });
  }

  function setPopoverOpen(open: boolean): void {
    if (popoverEl.hidden === !open) return;
    popoverEl.hidden = !open;
    allReloadsBtn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    // Opens beside the live card: to its left in the margin column, to its right when the card sits in the rail.
    const rect = changesSectionEl.getBoundingClientRect();
    const popoverWidth = 380;
    const left = railEl.contains(statusEl) ? rect.right + 12 : rect.left - popoverWidth - 12;
    popoverEl.style.left = `${Math.max(12, Math.min(left, window.innerWidth - popoverWidth - 12))}px`;
    popoverEl.style.top = `${Math.max(12, Math.min(rect.top, window.innerHeight - 480))}px`;
    renderHistory();
  }

  function updateScrollSpy(): void {
    const currentId = focusedPane().currentHeadingId();
    let currentText = '';
    for (const item of Array.from(outlineListEl.children) as HTMLElement[]) {
      const current = item.dataset.headingId === currentId;
      item.classList.toggle('is-current', current);
      if (current) {
        item.setAttribute('aria-current', 'location');
        currentText = item.textContent ?? '';
      } else {
        item.removeAttribute('aria-current');
      }
    }
    outlineSummaryEl.textContent = currentText;
  }

  function renderMarginColumn(): void {
    const pane = focusedPane();
    const documentState = pane.documentId ? documents.get(pane.documentId) : null;
    if (!documentState) {
      outlineEl.hidden = true;
      linksOutEl.hidden = true;
      return;
    }

    outlineListEl.replaceChildren();
    const headings = pane.headings();
    outlineEl.hidden = headings.length === 0;
    let anyChanged = false;
    for (const heading of headings) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'outline-item';
      item.dataset.level = heading.tagName.substring(1);
      item.dataset.headingId = heading.id;
      const text = document.createElement('span');
      text.className = 'outline-item__text';
      text.textContent = heading.textContent;
      item.appendChild(text);
      if (settings.markBlocks && documentState.changedSections.has(heading.id)) {
        const dot = document.createElement('span');
        dot.className = 'outline-item__dot';
        dot.title = t('margin.changedSection');
        item.appendChild(dot);
        anyChanged = true;
      }
      item.addEventListener('click', () => heading.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      outlineListEl.appendChild(item);
    }
    outlineLegendEl.hidden = !anyChanged;
    updateScrollSpy();
    updateCrumb();

    linksOutListEl.replaceChildren();
    const links = pane.outgoingLinks().slice(0, 8);
    linksOutEl.hidden = links.length === 0;
    for (const link of links) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'link-button links-out-item';
      item.textContent = link.text;
      item.title = link.href;
      item.addEventListener('click', () => pane.followLink(link.href));
      linksOutListEl.appendChild(item);
    }

    const words = documentState.content.trim().split(/\s+/).filter(Boolean).length;
    byId('fact-opened').textContent = formatTime(documentState.openedAt, false);
    byId('last-updated').textContent = formatModified(documentState.lastModified);
    byId('fact-size').textContent = tCount('facts.words', words);
    const filePathEl = byId('file-path');
    filePathEl.textContent = shortenHome(documentState.path);
    filePathEl.title = documentState.path;
  }

  function focusTab(documentId: string): void {
    const tab = Array.from(tabsEl.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((candidate) => candidate.dataset.documentId === documentId);
    tab?.focus();
  }

  // Dragging a rail row onto another one moves it in front of that row.
  function moveDocumentBefore(documentId: string, beforeId: string): void {
    const moved = documents.get(documentId);
    if (!moved || !documents.has(beforeId)) return;
    const reordered: Array<[string, OpenDocument]> = [];
    for (const [currentId, documentState] of documents) {
      if (currentId === documentId) continue;
      if (currentId === beforeId) reordered.push([documentId, moved]);
      reordered.push([currentId, documentState]);
    }
    documents.clear();
    reordered.forEach(([currentId, documentState]) => documents.set(currentId, documentState));
    renderTabs();
  }

  function renderTabs(): void {
    tabsEl.replaceChildren();
    const groups = documentGroups();
    const grouped = groups.length > 1;
    railHeadingEl.textContent = t('rail.documents');
    railCountEl.textContent = documents.size > 0 ? String(documents.size) : '';
    const activeId = focusedPane().documentId;

    let index = 0;
    for (const group of groups) {
      if (grouped) {
        const heading = document.createElement('div');
        heading.className = 'rail__heading rail__heading--group';
        heading.textContent = basename(group.folder) || '/';
        heading.title = group.folder;
        tabsEl.appendChild(heading);
      }

      for (const documentState of group.documents) {
        const isActive = documentState.id === activeId;
        const name = basename(documentState.path);
        const tabItem = document.createElement('div');
        tabItem.className = `document-tab${isActive ? ' is-active' : ''}${documentState.missing ? ' is-missing' : ''}`;
        tabItem.draggable = true;
        tabItem.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          openTabMenu(documentState.id, event.clientX, event.clientY);
        });
        tabItem.addEventListener('dragstart', (event) => {
          draggedDocumentId = documentState.id;
          event.dataTransfer?.setData(DOCUMENT_DRAG_TYPE, documentState.id);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        });
        tabItem.addEventListener('dragend', () => {
          draggedDocumentId = null;
        });
        tabItem.addEventListener('dragover', (event) => {
          if (!draggedDocumentId || draggedDocumentId === documentState.id) return;
          event.preventDefault();
          tabItem.classList.add('is-drop-before');
        });
        tabItem.addEventListener('dragleave', () => tabItem.classList.remove('is-drop-before'));
        tabItem.addEventListener('drop', (event) => {
          tabItem.classList.remove('is-drop-before');
          if (!draggedDocumentId || draggedDocumentId === documentState.id) return;
          event.preventDefault();
          moveDocumentBefore(draggedDocumentId, documentState.id);
        });

        const tabButton = document.createElement('button');
        tabButton.type = 'button';
        tabButton.id = `document-tab-${index}`;
        tabButton.className = 'document-tab__button';
        tabButton.dataset.documentId = documentState.id;
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-selected', String(isActive));
        tabButton.tabIndex = isActive ? 0 : -1;
        tabButton.title = documentState.path;
        tabButton.setAttribute(
          'aria-label',
          documentState.updateCount > 0 ? t('tab.updates', { name, count: documentState.updateCount }) : name
        );
        tabButton.addEventListener('click', () => {
          requestDocumentActivation(documentState.id);
          setRailOpen(false);
        });

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
        tabItem.appendChild(tabButton);

        if (split) {
          for (const pane of panes) {
            const isLeft = pane.index === 0;
            const paneButton = document.createElement('button');
            paneButton.type = 'button';
            paneButton.className = 'document-tab__pane';
            paneButton.textContent = t(isLeft ? 'tab.left' : 'tab.right');
            paneButton.title = t(isLeft ? 'tab.openLeft' : 'tab.openRight');
            paneButton.setAttribute('aria-label', t(isLeft ? 'tab.openLeftNamed' : 'tab.openRightNamed', { name }));
            paneButton.setAttribute('aria-pressed', String(pane.documentId === documentState.id));
            paneButton.addEventListener('click', () => showInPane(pane.index, documentState.id));
            tabItem.appendChild(paneButton);
          }
        }

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'document-tab__close';
        closeButton.innerHTML = CLOSE_ICON;
        closeButton.title = t('tab.close', { name });
        closeButton.setAttribute('aria-label', t('tab.close', { name }));
        closeButton.addEventListener('click', () => void livemark.closeDocument(documentState.id));
        tabItem.appendChild(closeButton);

        const shownIn = paneShowing(documentState.id);
        if (shownIn) {
          tabButton.setAttribute('aria-controls', shownIn.content.id);
          shownIn.content.setAttribute('aria-labelledby', tabButton.id);
        }
        tabsEl.appendChild(tabItem);
        index++;
      }
    }
    updateStatus();
    setRailOpen(document.documentElement.classList.contains('is-rail-open'));
  }

  function updatePaneHeader(pane: DocumentPane): void {
    const documentState = pane.documentId ? documents.get(pane.documentId) : null;
    pane.setHeader(
      documentState ? basename(documentState.path) : '',
      documentState ? formatModified(documentState.lastModified) : ''
    );
  }

  function refreshChrome(): void {
    workspaceEl.classList.toggle('is-split', split);
    workspaceEl.dataset.focusedPane = String(focusedPaneIndex);
    workspaceEl.classList.toggle('is-scrolled', !split && panes[0].scroller.scrollTop > 0);
    panes[1].element.hidden = !split;
    placeSections();
    const empty = documents.size === 0;
    emptyStateEl.style.display = empty ? 'block' : 'none';
    panesEl.hidden = empty;
    panes.forEach(updatePaneHeader);
    renderTabs();
    renderMarginColumn();
    renderHistory();
  }

  function focusPane(paneIndex: number): void {
    if (focusedPaneIndex === paneIndex || (!split && paneIndex !== 0)) return;
    focusedPaneIndex = paneIndex;
    reloadedFlashUntil = 0;
    const documentId = focusedPane().documentId;
    if (documentId) void livemark.activateDocument(documentId);
    refreshChrome();
  }

  function showInPane(paneIndex: number, documentId: string): void {
    const documentState = documents.get(documentId);
    if (!documentState) return;
    const pane = panes[split ? paneIndex : 0];
    if (pane.documentId !== documentId) {
      pane.show(documentState);
      applyMarks(pane);
    }
    focusedPaneIndex = pane.index;
    void livemark.activateDocument(documentId);
    refreshChrome();
    if (!findBarEl.hidden) runFind(true);
  }

  function requestDocumentActivation(documentId: string, moveFocus = false): void {
    activateDocument(documentId);
    if (moveFocus) focusTab(documentId);
  }

  function activateDocument(documentId: string): void {
    if (!documents.has(documentId)) return;
    const shownIn = paneShowing(documentId);
    if (shownIn) {
      if (shownIn.index !== focusedPaneIndex) focusPane(shownIn.index);
      else renderTabs();
      return;
    }
    reloadedFlashUntil = 0;
    showInPane(focusedPaneIndex, documentId);
  }

  function setSplit(enabled: boolean, keepPaneIndex = focusedPaneIndex): void {
    if (enabled === split) return;
    if (enabled) {
      if (window.innerWidth < MIN_SPLIT_WIDTH) {
        showToast(t('toast.tooNarrow'), t('toast.tooNarrowDetail'), 3000, null);
        return;
      }
      split = true;
      const other = visualOrder().find((documentId) => documentId !== panes[0].documentId);
      if (other) {
        panes[1].show(documents.get(other) as OpenDocument);
        applyMarks(panes[1]);
      }
    } else {
      const keptId = panes[keepPaneIndex].documentId;
      split = false;
      focusedPaneIndex = 0;
      panes[1].clear();
      if (keptId && panes[0].documentId !== keptId) {
        panes[0].show(documents.get(keptId) as OpenDocument);
        applyMarks(panes[0]);
      }
      if (keptId) void livemark.activateDocument(keptId);
    }
    refreshChrome();
  }

  tabsEl.addEventListener('keydown', (event) => {
    const target = (event.target as HTMLElement).closest('[role="tab"]') as HTMLButtonElement | null;
    if (!target) return;

    const documentIds = visualOrder();
    const currentIndex = documentIds.indexOf(target.dataset.documentId ?? '');
    if (currentIndex < 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % documentIds.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
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

  // One reload: record what changed, re-render the panes showing the document, and confirm it quietly.
  function applyUpdate(documentState: OpenDocument, snapshot: DocumentSnapshot): void {
    documentState.path = snapshot.path;
    documentState.content = snapshot.content;
    documentState.lastModified = snapshot.lastModified;
    documentState.updateCount++;

    const container = renderMarkdown(snapshot.content);
    const reload = diffReload(documentState.blockIndex, container, Date.now());
    documentState.blockIndex = indexBlocks(container);
    documentState.reloads.unshift(reload);
    documentState.markedReload = 0;
    documentState.marksUntil = settings.fadeMarks ? Date.now() + MARK_DURATION_MS : Infinity;
    reload.sections.forEach((section) => documentState.changedSections.add(section));

    const showing = visiblePanes().filter((pane) => pane.documentId === documentState.id);
    showing.forEach((pane, paneIndex) => {
      pane.show(documentState, {
        container: paneIndex === 0 ? container : renderMarkdown(snapshot.content),
        keepReadingPosition: true,
      });
      applyMarks(pane);
    });
    if (documentState.id === focusedPane().documentId) {
      reloadedFlashUntil = Date.now() + RELOADED_FLASH_MS;
    }

    // A reload is confirmed by the live card and the marks; the toast is opt-in.
    if (settings.notifyAll) {
      const detail = t('toast.detail', {
        summary: reload.blocks > 0 ? tCount('toast.blocksChanged', reload.blocks) : reload.text,
        time: formatTime(reload.time, true),
      });
      const title = showing.length > 0 ? t('toast.newVersion') : t('toast.reloaded', { name: basename(documentState.path) });
      showToast(title, detail, 4000, reload.blocks > 0 || showing.length === 0 ? documentState.id : null);
    }
    refreshChrome();
    if (!findBarEl.hidden) runFind(false);
  }

  function upsertDocument(snapshot: DocumentSnapshot, countAsUpdate: boolean): void {
    const existingDocument = documents.get(snapshot.id);
    if (existingDocument) {
      if (!countAsUpdate) return;
      if (existingDocument.paused) {
        existingDocument.held = snapshot;
        existingDocument.waiting++;
        updateStatus();
        return;
      }
      applyUpdate(existingDocument, snapshot);
      return;
    }

    documents.set(snapshot.id, {
      ...snapshot,
      updateCount: 0,
      openedAt: Date.now(),
      reloads: [],
      blockIndex: indexBlocks(renderMarkdown(snapshot.content)),
      changedSections: new Set(),
      markedReload: 0,
      marksUntil: 0,
      paused: false,
      held: null,
      waiting: 0,
      missing: false,
    });
    renderTabs();
  }

  livemark.onDocumentUpdate((snapshot) => upsertDocument(snapshot, true));
  livemark.onDocumentActivated(({ id }) => activateDocument(id));

  livemark.onDocumentMissing(({ id }) => {
    const documentState = documents.get(id);
    if (!documentState) return;
    documentState.missing = true;
    renderTabs();
  });

  livemark.onDocumentRestored(({ id }) => {
    const documentState = documents.get(id);
    if (!documentState) return;
    documentState.missing = false;
    renderTabs();
  });

  // The relocated document arrives as a new one; it takes over the history and rail position of the old one.
  livemark.onDocumentRelocated(({ fromId, toId }) => {
    const previous = documents.get(fromId);
    const relocated = documents.get(toId);
    if (!previous || !relocated) return;
    const contentChanged = previous.content !== relocated.content;
    const reload = diffReload(previous.blockIndex, renderMarkdown(relocated.content), Date.now());
    Object.assign(relocated, {
      updateCount: previous.updateCount + (contentChanged ? 1 : 0),
      openedAt: previous.openedAt,
      reloads: contentChanged ? [reload, ...previous.reloads] : previous.reloads,
      changedSections: previous.changedSections,
    });

    const reordered: Array<[string, OpenDocument]> = [];
    for (const [documentId, documentState] of documents) {
      if (documentId === toId) continue;
      if (documentId === fromId) reordered.push([toId, relocated]);
      reordered.push([documentId, documentState]);
    }
    documents.clear();
    reordered.forEach(([documentId, documentState]) => documents.set(documentId, documentState));
    panes.forEach((pane) => pane.forgetDocument(fromId, toId));
    showToast(t('toast.located'), shortenHome(relocated.path), 3000, null);
  });

  livemark.onDocumentClosed(({ id }) => {
    const order = visualOrder();
    const closingIndex = order.indexOf(id);
    documents.delete(id);
    for (const cacheKey of Array.from(paneHost.imageCache.keys())) {
      if (cacheKey.startsWith(`${id}\n`)) paneHost.imageCache.delete(cacheKey);
    }

    const remaining = order.filter((documentId) => documentId !== id);
    for (const pane of panes) {
      pane.forgetDocument(id);
      if (pane.documentId !== id) continue;
      const shownElsewhere = new Set(panes.filter((other) => other !== pane).map((other) => other.documentId));
      const candidates = [...remaining.slice(Math.min(closingIndex, Math.max(remaining.length - 1, 0))), ...remaining];
      const replacement = candidates.find((documentId) => !shownElsewhere.has(documentId));
      if (replacement) {
        pane.show(documents.get(replacement) as OpenDocument);
        applyMarks(pane);
      } else {
        pane.clear();
      }
    }

    if (split && (!panes[0].documentId || !panes[1].documentId)) {
      setSplit(false, panes[0].documentId ? 0 : 1);
    } else {
      refreshChrome();
    }
    const activeId = focusedPane().documentId;
    if (activeId) {
      void livemark.activateDocument(activeId);
      window.requestAnimationFrame(() => focusTab(activeId));
    }
  });

  // Go to File palette
  function renderPalette(): void {
    const query = paletteInput.value.trim();
    const ranked = paletteEntries
      .map((entry) => {
        const nameScore = fuzzyScore(query, basename(entry.path));
        const pathScore = fuzzyScore(query, entry.path);
        const score = nameScore ?? (pathScore === null ? null : pathScore + 5000);
        return { entry, score };
      })
      .filter((candidate): candidate is { entry: PaletteEntry; score: number } => candidate.score !== null)
      .sort((a, b) => a.score - b.score || Number(b.entry.open) - Number(a.entry.open))
      .slice(0, 12);

    paletteSelection = Math.min(paletteSelection, Math.max(ranked.length - 1, 0));
    paletteListEl.replaceChildren();
    ranked.forEach(({ entry }, entryIndex) => {
      const option = document.createElement('div');
      option.className = 'palette__option';
      option.id = `palette-option-${entryIndex}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(entryIndex === paletteSelection));
      option.dataset.path = entry.path;
      const name = document.createElement('span');
      name.className = 'palette__name';
      name.textContent = basename(entry.path);
      const folder = document.createElement('span');
      folder.className = 'palette__folder';
      folder.textContent = shortenHome(dirname(entry.path));
      option.append(name, folder);
      if (entry.open) {
        const badge = document.createElement('span');
        badge.className = 'palette__badge';
        badge.textContent = t('palette.open');
        option.appendChild(badge);
      }
      option.addEventListener('click', () => choosePaletteEntry(entry));
      paletteListEl.appendChild(option);
    });
    if (ranked.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'palette__empty';
      empty.textContent = t(paletteEntries.length === 0 ? 'palette.noDocuments' : 'palette.empty');
      paletteListEl.appendChild(empty);
    }
    paletteInput.setAttribute('aria-activedescendant', ranked.length > 0 ? `palette-option-${paletteSelection}` : '');
  }

  function closePalette(): void {
    if (paletteEl.hidden) return;
    paletteEl.hidden = true;
    paletteReturnFocus?.focus();
    paletteReturnFocus = null;
  }

  function openAbout(): void {
    aboutVersionEl.textContent = byId('app-version').textContent ?? '';
    aboutEl.hidden = false;
    aboutCloseBtn.focus();
  }

  function closeAbout(): void {
    if (aboutEl.hidden) return;
    aboutEl.hidden = true;
  }

  function choosePaletteEntry(entry: PaletteEntry): void {
    closePalette();
    if (entry.open) requestDocumentActivation(entry.path);
    else void livemark.openFilePaths([entry.path]);
  }

  function openPalette(): void {
    if (!paletteEl.hidden) return;
    paletteReturnFocus = document.activeElement as HTMLElement | null;
    paletteEntries = visualOrder().map((path) => ({ path, open: true }));
    paletteSelection = 0;
    paletteInput.value = '';
    paletteEl.hidden = false;
    paletteInput.focus();
    renderPalette();
    void livemark.listSiblingDocuments().then((paths) => {
      if (paletteEl.hidden) return;
      const siblings = paths.filter((path) => !documents.has(path)).map((path) => ({ path, open: false }));
      paletteEntries = [...paletteEntries.filter((entry) => entry.open), ...siblings];
      renderPalette();
    }).catch(() => undefined);
  }

  paletteInput.addEventListener('input', () => {
    paletteSelection = 0;
    renderPalette();
  });
  paletteInput.addEventListener('keydown', (event) => {
    const options = Array.from(paletteListEl.querySelectorAll<HTMLElement>('.palette__option'));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      paletteSelection = (paletteSelection + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      renderPalette();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const path = options[paletteSelection]?.dataset.path;
      const entry = paletteEntries.find((candidate) => candidate.path === path);
      if (entry) choosePaletteEntry(entry);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePalette();
    }
  });

  // Find in document: highlights every hit in the focused pane; Enter and Shift+Enter step through them.
  function runFind(resetPosition: boolean): void {
    const pane = focusedPane();
    findTotal = pane.find(findInput.value);
    if (resetPosition || findIndex >= findTotal) findIndex = 0;
    if (findTotal > 0) pane.showFindHit(findIndex);
    findCountEl.textContent = !findInput.value
      ? ''
      : findTotal === 0 ? t('find.none') : t('find.count', { current: findIndex + 1, total: findTotal });
  }

  function openFind(): void {
    if (!getActiveDocument()) return;
    findBarEl.hidden = false;
    findInput.focus();
    findInput.select();
    runFind(true);
  }

  function closeFind(): void {
    if (findBarEl.hidden) return;
    findBarEl.hidden = true;
    panes.forEach((pane) => pane.clearFind());
    focusedPane().content.focus({ preventScroll: true });
  }

  // Select All covers the focused pane's document only; app chrome (rail, margin column) stays out of it.
  function selectAllContent(): void {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      active.select();
      return;
    }
    const pane = focusedPane();
    if (!pane.documentId) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(pane.content);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  findInput.addEventListener('input', () => runFind(true));
  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && findTotal > 0) {
      event.preventDefault();
      findIndex = (findIndex + (event.shiftKey ? -1 : 1) + findTotal) % findTotal;
      focusedPane().showFindHit(findIndex);
      findCountEl.textContent = t('find.count', { current: findIndex + 1, total: findTotal });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeFind();
    }
  });
  byId('find-close-btn').addEventListener('click', closeFind);
  aboutCloseBtn.addEventListener('click', closeAbout);

  // Text zoom scales the document only; the rail, margin column and measure keep their size.
  let textZoom = Number(localStorage.getItem(TEXT_ZOOM_KEY)) || 100;

  function setTextZoom(percent: number, announce: boolean): void {
    textZoom = Math.min(TEXT_ZOOM_MAX, Math.max(TEXT_ZOOM_MIN, Math.round(percent / TEXT_ZOOM_STEP) * TEXT_ZOOM_STEP));
    document.documentElement.style.setProperty('--text-zoom', String(textZoom / 100));
    localStorage.setItem(TEXT_ZOOM_KEY, String(textZoom));
    if (announce) showToast(t('toast.textZoom', { percent: textZoom }), '', 1200, null);
  }

  setTextZoom(textZoom, false);

  function runCommand(command: string): void {
    const documentState = getActiveDocument();
    const showDocument = /^show-document-(\d)$/.exec(command);
    if (showDocument) {
      const documentId = visualOrder()[Number(showDocument[1]) - 1];
      if (documentId) requestDocumentActivation(documentId);
    } else if (command === 'text-zoom-in') {
      setTextZoom(textZoom + TEXT_ZOOM_STEP, true);
    } else if (command === 'text-zoom-out') {
      setTextZoom(textZoom - TEXT_ZOOM_STEP, true);
    } else if (command === 'text-zoom-reset') {
      setTextZoom(100, true);
    } else if (command === 'go-to-file') {
      openPalette();
    } else if (command === 'find') {
      openFind();
    } else if (command === 'select-all') {
      selectAllContent();
    } else if (command === 'copy-plain-text') {
      copyDocumentAsPlainText();
    } else if (command === 'next-change') {
      stepThroughChanges();
    } else if (command === 'toggle-split') {
      setSplit(!split);
    } else if (command === 'toggle-pause' && documentState && !documentState.missing) {
      setPaused(documentState, !documentState.paused);
    } else if (command === 'export-pdf') {
      void exportFocusedDocument();
    } else if (command === 'check-updates') {
      updates.checkManually();
    } else if (command === 'about') {
      openAbout();
    }
  }

  let exportInFlight = false;

  async function exportFocusedDocument(): Promise<void> {
    const documentState = getActiveDocument();
    const pane = focusedPane();
    if (exportInFlight || !documentState || !pane.documentId) return;
    exportInFlight = true;
    for (const candidate of panes) candidate.element.classList.remove('is-print-target');
    pane.element.classList.add('is-print-target');
    try {
      await livemark.exportPdf(documentState.path);
    } finally {
      pane.element.classList.remove('is-print-target');
      exportInFlight = false;
    }
  }

  livemark.onMenuCommand(runCommand);

  // The menu owns these shortcuts in the app; the key handler covers contexts where no native menu exists.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setPopoverOpen(false);
      closeTabMenu();
      setRailOpen(false);
      closeAbout();
      return;
    }
    if (!event.metaKey && !event.ctrlKey) return;
    const key = event.key.toLowerCase();
    let command: string | undefined;
    if (key === '+') {
      command = 'text-zoom-in';
    } else if (event.shiftKey) {
      command = key === 'n' ? 'next-change' : key === 'p' ? 'toggle-pause' : key === 'c' ? 'copy-plain-text' : undefined;
    } else if (key === '=' || key === '+') {
      command = 'text-zoom-in';
    } else if (key === '-') {
      command = 'text-zoom-out';
    } else if (key === '0') {
      command = 'text-zoom-reset';
    } else if (key === 'e') {
      command = 'export-pdf';
    } else if (key === 'p') {
      command = 'go-to-file';
    } else if (key === 'f') {
      command = 'find';
    } else if (key === 'a') {
      command = 'select-all';
    } else if (key === '\\') {
      command = 'toggle-split';
    } else if (/^[1-9]$/.test(key)) {
      command = `show-document-${key}`;
    }
    if (!command) return;
    event.preventDefault();
    runCommand(command);
  });

  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node;
    if (!popoverEl.hidden && !popoverEl.contains(target) && !allReloadsBtn.contains(target)) setPopoverOpen(false);
    if (!paletteEl.hidden && !paletteEl.contains(target)) closePalette();
    if (!tabMenuEl.hidden && !tabMenuEl.contains(target)) closeTabMenu();
    if (!aboutEl.hidden && !aboutCardEl.contains(target)) closeAbout();
    if (
      document.documentElement.classList.contains('is-rail-open') &&
      !railEl.contains(target) &&
      !railToggle.contains(target) &&
      !popoverEl.contains(target) &&
      !tabMenuEl.contains(target)
    ) {
      setRailOpen(false);
    }
  });

  window.addEventListener('resize', () => {
    setPopoverOpen(false);
    closeTabMenu();
    layoutDockedRail();
    updateCrumb();
  });
  marginColumnMedia.addEventListener('change', () => {
    setPopoverOpen(false);
    placeSections();
  });
  railCollapseMedia.addEventListener('change', () => {
    setRailOpen(false);
    layoutDockedRail();
  });
  railToggle.addEventListener('click', () => {
    // A rail the user hid on a wide window docks again; on a narrow window it opens over the document.
    if (panelLayout.railHidden && !railCollapseMedia.matches) {
      setRailHidden(false);
      return;
    }
    setRailOpen(!document.documentElement.classList.contains('is-rail-open'));
  });
  byId('rail-hide-btn').addEventListener('click', () => {
    if (railCollapseMedia.matches) setRailOpen(false);
    else setRailHidden(true);
  });
  byId('details-hide-btn').addEventListener('click', () => setDetailsHidden(true));
  detailsShowBtn.addEventListener('click', () => setDetailsHidden(false));

  for (const sectionEl of Array.from(document.querySelectorAll<HTMLElement>('.panel-section[data-section]'))) {
    const section = sectionEl.dataset.section as CollapsibleSection;
    sectionEl.querySelector('.panel-section__toggle')?.addEventListener('click', () => {
      setSectionCollapsed(section, !panelLayout.collapsed[section]);
    });
  }
  applyCollapsedSections();

  for (const section of MOVABLE_SECTIONS) {
    const sectionEl = sectionEls[section];
    const header = sectionEl.querySelector('.panel-section__header') as HTMLElement;
    const grip = sectionEl.querySelector('.panel-section__grip') as HTMLButtonElement;
    grip.addEventListener('click', () => {
      const current = slotEls.rail.contains(sectionEl) ? 'rail' : 'details';
      moveSection(section, otherPanel(current));
      grip.focus();
    });
    header.addEventListener('dragstart', (event) => {
      if (detailsState() !== 'shown' || !event.dataTransfer) {
        event.preventDefault();
        return;
      }
      draggedSection = section;
      event.dataTransfer.setData(SECTION_DRAG_TYPE, section);
      event.dataTransfer.effectAllowed = 'move';
      const from: PanelId = slotEls.rail.contains(sectionEl) ? 'rail' : 'details';
      // Defer, so the drag image is taken before the section dims and the other panel opens a drop target.
      window.setTimeout(() => {
        sectionEl.classList.add('is-dragging');
        slotEls[otherPanel(from)].classList.add('is-drop-target');
      }, 0);
    });
    header.addEventListener('dragend', () => {
      draggedSection = null;
      sectionEl.classList.remove('is-dragging');
      for (const slot of Object.values(slotEls)) slot.classList.remove('is-drop-target', 'is-drop-hover');
    });
  }

  for (const panel of ['rail', 'details'] as PanelId[]) {
    const panelEl = panel === 'rail' ? railEl : marginColumnEl;
    panelEl.addEventListener('dragover', (event) => {
      if (!draggedSection || !event.dataTransfer?.types.includes(SECTION_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      slotEls[panel].classList.add('is-drop-hover');
    });
    panelEl.addEventListener('dragleave', (event) => {
      if (!panelEl.contains(event.relatedTarget as Node | null)) slotEls[panel].classList.remove('is-drop-hover');
    });
    panelEl.addEventListener('drop', (event) => {
      if (!draggedSection) return;
      event.preventDefault();
      const section = draggedSection;
      slotEls[panel].classList.remove('is-drop-hover');
      moveSection(section, panel);
    });
  }

  // While the rail is folded, its footer's app controls stay reachable from the corner bar.
  function syncUpdateStatus(): void {
    const shown = !updateBannerEl.hidden;
    railMiniUpdateBtn.hidden = !shown;
    railMiniUpdateTextEl.textContent = shown ? updateTextEl.textContent ?? '' : '';
  }
  new MutationObserver(syncUpdateStatus).observe(updateBannerEl, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true });
  syncUpdateStatus();
  railMiniUpdateBtn.addEventListener('click', () => {
    if (panelLayout.railHidden && !railCollapseMedia.matches) setRailHidden(false);
    else setRailOpen(true);
  });
  railMiniThemeBtn.addEventListener('click', () => {
    themeToggleInput.checked = !themeToggleInput.checked;
    themeToggleInput.dispatchEvent(new Event('change'));
  });
  setRailOpen(false);

  allReloadsBtn.addEventListener('click', () => setPopoverOpen(popoverEl.hidden));
  byId('go-to-file-btn').addEventListener('click', openPalette);
  byId('clear-marks-btn').addEventListener('click', clearAllMarks);
  pauseBtn.addEventListener('click', () => {
    const documentState = getActiveDocument();
    if (documentState) setPaused(documentState, !documentState.paused);
  });
  statusActionBtn.addEventListener('click', () => {
    const documentState = getActiveDocument();
    if (!documentState) return;
    if (documentState.missing) void livemark.locateDocument(documentState.id);
    else if (documentState.paused) setPaused(documentState, false);
    else jumpToReload(documentState, 0);
  });
  toastViewBtn.addEventListener('click', () => {
    const documentState = toastTarget ? documents.get(toastTarget) : null;
    if (!documentState) return;
    activateDocument(documentState.id);
    jumpToReload(documentState, 0);
  });

  const settingInputs: Array<[keyof ReloadSettings, string]> = [
    ['markBlocks', 'setting-mark-blocks'],
    ['fadeMarks', 'setting-fade-marks'],
    ['notifyAll', 'setting-notify-all'],
  ];
  for (const [key, inputId] of settingInputs) {
    const input = byId<HTMLInputElement>(inputId);
    input.checked = settings[key];
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      for (const documentState of documents.values()) {
        if (documentState.marksUntil > Date.now()) {
          documentState.marksUntil = settings.fadeMarks ? Date.now() + MARK_DURATION_MS : Infinity;
        }
      }
      visiblePanes().forEach(applyMarks);
      renderMarginColumn();
    });
  }

  themeToggleInput.checked = localStorage.getItem(THEME_KEY) === 'dark';
  railMiniThemeBtn.setAttribute('aria-pressed', String(themeToggleInput.checked));
  themeToggleInput.addEventListener('change', () => {
    const dark = themeToggleInput.checked;
    applyTheme(dark);
    railMiniThemeBtn.setAttribute('aria-pressed', String(dark));
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  });

  function closeTabMenu(): void {
    tabMenuEl.hidden = true;
    tabMenuDocumentId = null;
  }

  function openTabMenu(documentId: string, x: number, y: number): void {
    tabMenuDocumentId = documentId;
    tabMenuEl.hidden = false;
    tabMenuEl.style.left = `${x}px`;
    tabMenuEl.style.top = `${y}px`;
    const rect = tabMenuEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = y + rect.height > window.innerHeight - 8 ? Math.max(8, y - rect.height) : y;
    tabMenuEl.style.left = `${left}px`;
    tabMenuEl.style.top = `${top}px`;
  }

  function copyPlainText(text: string, title: string, detail: string): void {
    plainClipboard = text;
    document.execCommand('copy');
    if (plainClipboard === null) {
      showToast(title, detail, 1600, null);
      return;
    }
    const leftover = plainClipboard;
    plainClipboard = null;
    void navigator.clipboard.writeText(leftover).then(
      () => showToast(title, detail, 1600, null),
      () => showToast(t('toast.copyFailed'), detail, 3000, null)
    );
  }

  tabMenuCopyBtn.addEventListener('click', () => {
    const documentState = tabMenuDocumentId ? documents.get(tabMenuDocumentId) : null;
    closeTabMenu();
    if (!documentState) return;
    copyPlainText(documentState.path, t('toast.pathCopied'), documentState.path);
  });
  tabMenuFolderBtn.addEventListener('click', () => {
    const documentId = tabMenuDocumentId;
    closeTabMenu();
    if (!documentId) return;
    void livemark.openContainingFolder(documentId).catch(() => {
      const documentState = documents.get(documentId);
      showToast(t('toast.folderFailed'), documentState?.path ?? '', 3000, null);
    });
  });

  /** Where a copy comes from: the selection inside a pane, or the focused pane's whole document. */
  function copyTarget(): { pane: DocumentPane; selectionHtml: string | null; coversDocument: boolean } {
    let pane = focusedPane();
    let selectionHtml: string | null = null;
    let coversDocument = false;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectionPane = panes.find((candidate) => candidate.content.contains(range.commonAncestorContainer));
      if (selectionPane) {
        pane = selectionPane;
        coversDocument = selectionCoversElement(range, pane.content);
        if (!coversDocument) {
          const temporaryContainer = document.createElement('div');
          temporaryContainer.appendChild(range.cloneContents());
          selectionHtml = temporaryContainer.innerHTML;
        }
      }
    }
    return { pane, selectionHtml, coversDocument };
  }

  document.addEventListener('copy', (event) => {
    if (plainClipboard !== null) {
      event.preventDefault();
      event.clipboardData?.setData('text/plain', plainClipboard);
      plainClipboard = null;
      return;
    }
    const pathSelection = window.getSelection();
    const filePathEl = byId('file-path');
    if (
      pathSelection &&
      !pathSelection.isCollapsed &&
      pathSelection.anchorNode &&
      pathSelection.focusNode &&
      filePathEl.contains(pathSelection.anchorNode) &&
      filePathEl.contains(pathSelection.focusNode)
    ) {
      event.preventDefault();
      const text = pathSelection.toString();
      event.clipboardData?.setData('text/plain', text);
      showToast(t('toast.pathCopied'), text, 1600, null);
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    const documentState = getActiveDocument();
    if (!documentState?.content) return;
    event.preventDefault();

    const { selectionHtml, coversDocument } = copyTarget();
    event.clipboardData?.setData('text/plain', markdownForCopy(documentState.content, selectionHtml, coversDocument));
    showToast(t('toast.copied'), '', 1000, null);
  });

  /** Copy as Plain Text (⇧⌘C): the same target as a Markdown copy, but stripped of Markdown syntax. */
  function copyDocumentAsPlainText(): void {
    const { pane, selectionHtml, coversDocument } = copyTarget();
    if (!pane.documentId) return;
    const html = coversDocument || selectionHtml === null ? pane.content.innerHTML : selectionHtml;
    copyPlainText(htmlToPlainText(html), t('toast.copiedPlain'), '');
  }

  byId('open-file-btn').addEventListener('click', () => {
    void livemark.openFile();
  });

  livemark.onOpenFailed(({ path }) => {
    showToast(t('toast.openFailed'), basename(path), 4000, null);
  });

  livemark.onFileDrop((filePaths) => {
    if (filePaths.length > 0) {
      void livemark.openFilePaths(filePaths);
    }
  });

  void livemark.bootstrap().then((state) => {
    byId('app-version').textContent = `v${state.version}`;
    railMiniVersionEl.textContent = `v${state.version}`;
    for (const snapshot of state.documents) {
      upsertDocument(snapshot, false);
    }
    for (const documentId of state.missingDocumentIds) {
      const documentState = documents.get(documentId);
      if (documentState) documentState.missing = true;
    }
    if (state.activeDocumentId) {
      activateDocument(state.activeDocumentId);
    }
    refreshChrome();
  });
});
