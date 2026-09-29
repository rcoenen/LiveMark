// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

async function labelsFor(userAgent: string): Promise<{ goToFile: string; nextChange: string; closeHint: string }> {
  vi.stubGlobal('navigator', { userAgent });
  vi.resetModules();
  const { t } = await import('../strings');
  return {
    goToFile: t('shortcut.goToFile'),
    nextChange: t('shortcut.nextChange'),
    closeHint: t('rail.closeHint'),
  };
}

describe('shortcut labels', () => {
  it('uses Command glyphs on macOS and Ctrl labels on Windows', async () => {
    await expect(labelsFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).resolves.toEqual({
      goToFile: '⌘P',
      nextChange: '⌘⇧N',
      closeHint: '⌘W close',
    });
    await expect(labelsFor('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).resolves.toEqual({
      goToFile: 'Ctrl+P',
      nextChange: 'Ctrl+Shift+N',
      closeHint: 'Ctrl+W close',
    });
  });

  it('keeps Command glyphs when the agent only says win32', async () => {
    await expect(labelsFor('Mozilla/5.0 (win32) AppleWebKit/537.36 jsdom')).resolves.toMatchObject({
      goToFile: '⌘P',
    });
  });
});
