// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { blockKey, changeableItems, renderMarkdown } from '../markdown';

describe('renderMarkdown sanitising', () => {
  it('removes elements that could script, restyle or navigate the app', () => {
    const html = renderMarkdown([
      '<style>body{display:none}</style>',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
      '<base href="https://evil.example/">',
      '<form action="https://evil.example"><input name="q"></form>',
      '<iframe src="https://evil.example"></iframe>',
      '<script>window.pwned = true</script>',
      '',
      'Still here.',
    ].join('\n')).innerHTML;

    expect(html).not.toMatch(/<(style|meta|base|form|iframe|script)/i);
    expect(html).toContain('Still here.');
  });

  it('strips event handlers, inline styles and javascript: URLs', () => {
    const container = renderMarkdown('<img src="https://example.com/a.png" onerror="alert(1)" style="position:fixed">\n\n<a href="javascript:alert(1)">x</a>');

    const image = container.querySelector('img');
    expect(image?.getAttribute('onerror')).toBeNull();
    expect(image?.getAttribute('style')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBeNull();
  });

  it('keeps remote images and defers local ones to the backend', () => {
    const container = renderMarkdown('![remote](https://example.com/badge.svg)\n\n![local](<my image.png>)\n\n<img src="file:///tmp/raw.png">');
    const [remote, local, raw] = Array.from(container.querySelectorAll('img'));

    expect(remote.getAttribute('src')).toBe('https://example.com/badge.svg');
    expect(local.getAttribute('src')).toBe('data:,');
    expect(local.getAttribute('data-livemark-source')).toBe('my%20image.png');
    expect(raw.getAttribute('data-livemark-source')).toBe('file:///tmp/raw.png');
  });
});

describe('renderMarkdown structure', () => {
  it('gives headings unique ids', () => {
    const container = renderMarkdown('## Tabel\n\n## Tabel\n\n### Bewijs & last');
    expect(Array.from(container.querySelectorAll('h2, h3'), (heading) => heading.id))
      .toEqual(['tabel', 'tabel-2', 'bewijs-last']);
  });

  it('fingerprints blocks by content and exposes table rows and list items', () => {
    const before = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n\n- one\n- two');
    const after = renderMarkdown('| a | b |\n|---|---|\n| 1 | 3 |\n\n- one\n- two');
    const [tableBefore, listBefore] = Array.from(before.children);
    const [tableAfter, listAfter] = Array.from(after.children);

    expect(blockKey(listBefore)).toBe(blockKey(listAfter));
    expect(blockKey(tableBefore)).not.toBe(blockKey(tableAfter));
    expect(changeableItems(tableAfter)).toHaveLength(2);
    expect(changeableItems(listAfter)).toHaveLength(2);
  });
});
