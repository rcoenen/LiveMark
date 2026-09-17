// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../markdown';
import { diffReload, fuzzyScore, indexBlocks, isReloadOnScreen } from '../reloads';

const BASE = '# Title\n\nIntro.\n\n## Tabel\n\n| k | v |\n|---|---|\n| K01 | one |\n| K02 | two |\n\n## Limits\n\nOld text.';

function reload(before: string, after: string) {
  const container = renderMarkdown(after);
  return { entry: diffReload(indexBlocks(renderMarkdown(before)), container, 1), container };
}

describe('diffReload', () => {
  it('marks a rewritten paragraph and names its section', () => {
    const { entry } = reload(BASE, BASE.replace('Old text.', 'New text.'));
    expect(entry.blocks).toBe(1);
    expect(entry.text).toBe('Limits · paragraph rewritten');
    expect(entry.sections).toEqual(['limits']);
  });

  it('marks only the changed table row', () => {
    const { entry, container } = reload(BASE, BASE.replace('two', 'twee'));
    expect(entry.blocks).toBe(1);
    expect(entry.text).toBe('Tabel · row rewritten');
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(2);
  });

  it('reports added paragraphs and removed content', () => {
    expect(reload(BASE, `${BASE}\n\nAdded.`).entry.text).toBe('Limits · paragraph added');
    const removal = reload(BASE, BASE.replace('Intro.\n\n', '')).entry;
    expect(removal.blocks).toBe(0);
    expect(removal.text).toBe('Content removed');
  });

  it('knows when an older reload is no longer in the document', () => {
    const first = reload(BASE, BASE.replace('Old text.', 'Second text.'));
    const later = indexBlocks(renderMarkdown(BASE.replace('Old text.', 'Third text.')));
    expect(isReloadOnScreen(first.entry, indexBlocks(first.container))).toBe(true);
    expect(isReloadOnScreen(first.entry, later)).toBe(false);
  });
});

describe('fuzzyScore', () => {
  it('prefers direct matches and rejects non-matches', () => {
    expect(fuzzyScore('spec', 'SPEC-feedback.md')).toBe(0);
    expect(fuzzyScore('sfb', 'SPEC-feedback.md')).toBeGreaterThan(fuzzyScore('feed', 'SPEC-feedback.md') as number);
    expect(fuzzyScore('xyz', 'SPEC-feedback.md')).toBeNull();
  });
});
