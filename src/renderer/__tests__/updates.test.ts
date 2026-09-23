// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { bannerModel } from '../updates';

describe('bannerModel', () => {
  it('offers install and release notes to direct installs', () => {
    const model = bannerModel({ kind: 'available', version: '1.5.0', source: 'direct' });
    expect(model.text).toBe('LiveMark 1.5.0 is available');
    expect(model.detail).toBe('');
    expect(model.actionLabel).toBe('Update & Restart');
    expect(model.showNotes).toBe(true);
    expect(model.autoHideMs).toBeNull();
  });

  it('points brew installs at brew upgrade and never at in-app install', () => {
    const model = bannerModel({ kind: 'available', version: '1.5.0', source: 'brew' });
    expect(model.text).toBe('LiveMark 1.5.0 is available');
    expect(model.detail).toBe('Installed via Homebrew');
    expect(model.actionLabel).toBe('Copy brew upgrade command');
    expect(model.showNotes).toBe(true);
    expect(model.autoHideMs).toBeNull();
  });

  it('shows download progress without actions', () => {
    const model = bannerModel({ kind: 'progress', percent: 42 });
    expect(model.text).toBe('Downloading… 42%');
    expect(model.actionLabel).toBeNull();
    expect(model.showNotes).toBe(false);
  });

  it('reports up-to-date briefly on manual checks', () => {
    const model = bannerModel({ kind: 'up-to-date', version: '1.4.3' });
    expect(model.text).toBe('LiveMark is up to date (1.4.3)');
    expect(model.actionLabel).toBeNull();
    expect(model.autoHideMs).not.toBeNull();
  });

  it('reports failures with a release-notes link', () => {
    const model = bannerModel({ kind: 'failed' });
    expect(model.text).toBe('Update check failed');
    expect(model.showNotes).toBe(true);
    expect(model.autoHideMs).not.toBeNull();
  });
});
