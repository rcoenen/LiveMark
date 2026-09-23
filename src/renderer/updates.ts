import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { t } from './strings';

export type InstallSource = 'dev' | 'brew' | 'direct';

export type BannerState =
  | { kind: 'hidden' }
  | { kind: 'available'; version: string; source: Exclude<InstallSource, 'dev'> }
  | { kind: 'progress'; percent: number }
  | { kind: 'installing' }
  | { kind: 'up-to-date'; version: string }
  | { kind: 'failed' };

export interface BannerModel {
  text: string;
  detail: string;
  actionLabel: string | null;
  showNotes: boolean;
  /** Milliseconds after which the banner hides itself; null means it stays until dismissed. */
  autoHideMs: number | null;
}

const RELEASES_URL = 'https://github.com/rcoenen/LiveMark/releases/latest';
const BREW_UPGRADE_COMMAND = 'brew upgrade --cask livemark';
const STARTUP_CHECK_DELAY_MS = 3000;
const BREW_COPIED_FEEDBACK_MS = 3000;

/** Pure mapping from update state to banner content, so the branching stays testable. */
export function bannerModel(state: Exclude<BannerState, { kind: 'hidden' }>): BannerModel {
  switch (state.kind) {
    case 'available':
      return {
        text: t('update.available', { version: state.version }),
        detail: state.source === 'brew' ? t('update.brewDetail') : '',
        actionLabel: t(state.source === 'brew' ? 'update.actionCopyBrew' : 'update.actionInstall'),
        showNotes: true,
        autoHideMs: null,
      };
    case 'progress':
      return { text: t('update.downloading', { percent: state.percent }), detail: '', actionLabel: null, showNotes: false, autoHideMs: null };
    case 'installing':
      return { text: t('update.installing'), detail: '', actionLabel: null, showNotes: false, autoHideMs: null };
    case 'up-to-date':
      return { text: t('update.upToDate', { version: state.version }), detail: '', actionLabel: null, showNotes: false, autoHideMs: 5000 };
    case 'failed':
      return { text: t('update.failed'), detail: '', actionLabel: null, showNotes: true, autoHideMs: 6000 };
  }
}

export interface UpdatesHandle {
  checkManually(): void;
}

export function initUpdates(): UpdatesHandle {
  const bannerEl = document.getElementById('app-update-banner') as HTMLElement;
  const textEl = document.getElementById('app-update-text') as HTMLElement;
  const detailEl = document.getElementById('app-update-detail') as HTMLElement;
  const actionBtn = document.getElementById('app-update-action') as HTMLButtonElement;
  const notesBtn = document.getElementById('app-update-notes') as HTMLButtonElement;
  const dismissBtn = document.getElementById('app-update-dismiss') as HTMLButtonElement;

  let state: BannerState = { kind: 'hidden' };
  let pendingUpdate: Update | null = null;
  let installing = false;
  let hideTimer: number | null = null;

  function render(): void {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (state.kind === 'hidden') {
      bannerEl.hidden = true;
      return;
    }
    const model = bannerModel(state);
    textEl.textContent = model.text;
    detailEl.textContent = model.detail;
    actionBtn.hidden = model.actionLabel === null;
    actionBtn.textContent = model.actionLabel ?? '';
    notesBtn.hidden = !model.showNotes;
    bannerEl.hidden = false;
    if (model.autoHideMs !== null) {
      hideTimer = window.setTimeout(() => {
        state = { kind: 'hidden' };
        render();
      }, model.autoHideMs);
    }
  }

  async function runInstall(): Promise<void> {
    if (!pendingUpdate || installing) return;
    installing = true;
    let downloaded = 0;
    let total = 0;
    try {
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            state = { kind: 'progress', percent: Math.min(99, Math.round((downloaded / total) * 100)) };
            render();
          }
        }
      });
      state = { kind: 'installing' };
      render();
      await relaunch();
    } catch {
      installing = false;
      state = { kind: 'failed' };
      render();
    }
  }

  async function copyBrewCommand(): Promise<void> {
    try {
      await navigator.clipboard.writeText(BREW_UPGRADE_COMMAND);
      detailEl.textContent = t('update.brewCopied');
      window.setTimeout(() => {
        if (state.kind === 'available') detailEl.textContent = t('update.brewDetail');
      }, BREW_COPIED_FEEDBACK_MS);
    } catch {
      detailEl.textContent = BREW_UPGRADE_COMMAND;
    }
  }

  actionBtn.addEventListener('click', () => {
    if (state.kind === 'available' && state.source === 'brew') void copyBrewCommand();
    else void runInstall();
  });
  notesBtn.addEventListener('click', () => void openUrl(RELEASES_URL).catch(() => undefined));
  dismissBtn.addEventListener('click', () => {
    state = { kind: 'hidden' };
    render();
  });

  async function runCheck(manual: boolean): Promise<void> {
    try {
      const source = (await invoke<string>('install_source')) as InstallSource;
      if (source === 'dev') {
        if (manual) {
          state = { kind: 'up-to-date', version: await getVersion() };
          render();
        }
        return;
      }
      const update = await check();
      if (update) {
        pendingUpdate = update;
        state = { kind: 'available', version: update.version, source };
      } else if (manual) {
        state = { kind: 'up-to-date', version: await getVersion() };
      }
      render();
    } catch {
      if (manual) {
        state = { kind: 'failed' };
        render();
      }
    }
  }

  window.setTimeout(() => void runCheck(false), STARTUP_CHECK_DELAY_MS);
  return { checkManually: () => void runCheck(true) };
}
