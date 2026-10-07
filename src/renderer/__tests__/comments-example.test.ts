// @vitest-environment jsdom
import { HtmlRenderer, Parser } from 'commonmark';
import { describe, expect, it } from 'vitest';
import { parseReview } from '../comments/format';
import { loadComments, threadsOf } from '../comments/state';
import { renderMarkdown } from '../markdown';
import EXAMPLE from '../../../docs/examples/commented.md?raw';



const visibleWithLiveMark = (text: string): string => renderMarkdown(text).textContent ?? '';
function visibleWithCommonMark(text: string): string {
  const container = document.createElement('div');
  container.innerHTML = new HtmlRenderer().render(new Parser().parse(text));
  return container.textContent ?? '';
}

describe('the documented example file', () => {
  it('is valid and its anchors match the body', () => {
    const parsed = parseReview(EXAMPLE);
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    expect(parsed.digestMatches).toBe(true);
    const state = loadComments(EXAMPLE);
    expect(threadsOf(state).map((thread) => [thread.status, thread.anchor.exact])).toEqual([
      ['open', 'next week'],
      ['resolved', 'longer than planned'],
    ]);
  });

  it('renders the same visible text with and without the footer, in LiveMark and in CommonMark (A12)', () => {
    const body = parseReview(EXAMPLE).body;
    for (const visible of [visibleWithLiveMark, visibleWithCommonMark]) {
      expect(visible(EXAMPLE).trim()).toBe(visible(body).trim());
      expect(visible(EXAMPLE)).not.toContain('"format"');
      expect(visible(EXAMPLE)).not.toContain('Which date exactly');
    }
  });
});
