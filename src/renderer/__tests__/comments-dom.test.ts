// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clearHighlights, highlightBlock, renderedRange, sourceBlocks, sourceRangeForSelection } from '../comments/dom';
import { renderMarkdown } from '../markdown';

function mount(body: string): HTMLElement {
  document.body.replaceChildren();
  const root = renderMarkdown(body);
  document.body.appendChild(root);
  return root;
}

/** A DOM range over the `occurrence`-th rendered appearance of `phrase` in the document. */
function select(root: HTMLElement, phrase: string, occurrence = 0): Range {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const text = nodes.map((node) => node.data).join('');
  let index = -1;
  for (let k = 0; k <= occurrence; k++) index = text.indexOf(phrase, index + 1);
  if (index < 0) throw new Error(`phrase not found: ${phrase}`);
  const locate = (offset: number, preferEnd: boolean): [Text, number] => {
    let seen = 0;
    for (const node of nodes) {
      if (offset < seen + node.data.length || (preferEnd && offset === seen + node.data.length)) return [node, offset - seen];
      seen += node.data.length;
    }
    const last = nodes[nodes.length - 1];
    return [last, last.data.length];
  };
  const range = document.createRange();
  range.setStart(...locate(index, false));
  range.setEnd(...locate(index + phrase.length, true));
  return range;
}

function anchor(body: string, phrase: string, occurrence = 0): string {
  const root = mount(body);
  const result = sourceRangeForSelection(select(root, phrase, occurrence), root, body);
  if (!result.ok) return `refused: ${result.reason}`;
  return body.substring(result.start, result.end);
}

describe('sourceRangeForSelection (A4)', () => {
  it('anchors the second occurrence of a repeated phrase to the second occurrence in the source', () => {
    const body = '# T\n\nThe plan is late. Really, the plan is late.\n';
    const root = mount(body);
    const result = sourceRangeForSelection(select(root, 'plan is late', 1), root, body);
    expect(result).toEqual({ ok: true, start: body.lastIndexOf('plan is late'), end: body.lastIndexOf('plan is late') + 12 });
  });

  it('maps a partial selection inside bold text within the delimiters', () => {
    expect(anchor('Ship **next week** please.\n', 'next')).toBe('next');
  });

  it('takes the delimiters along when a whole bold node is selected', () => {
    expect(anchor('Ship **next week** please.\n', 'next week')).toBe('**next week**');
  });

  it('includes a whole link with its destination when the whole label is selected', () => {
    expect(anchor('See [the docs](https://example.com/a) today.\n', 'the docs')).toBe('[the docs](https://example.com/a)');
    expect(anchor('See [the docs](https://example.com/a) today.\n', 'docs')).toBe('docs');
  });

  it('crosses formatting within one paragraph', () => {
    expect(anchor('We *really* need it.\n', 'really need')).toBe('*really* need');
  });

  it('handles emoji, combining characters and CRLF', () => {
    expect(anchor('Line 😀 one\r\nCafé two\r\n', 'Café two')).toBe('Café two');
    expect(anchor('Line 😀 one\r\nnext\r\n', '😀 one')).toBe('😀 one');
  });

  it('maps typographic quotes, dashes and entities back to their source spelling', () => {
    expect(anchor('He said "go" -- now &amp; then.\n', '“go” – now & then')).toBe('"go" -- now &amp; then');
  });

  it('supports list items and quotes', () => {
    expect(anchor('- first item\n- second item\n', 'second')).toBe('second');
    expect(anchor('> quoted words here\n> and more\n', 'words here')).toBe('words here');
    expect(anchor('## A heading\n\nText.\n', 'heading')).toBe('heading');
  });

  it('refuses selections across blocks, in code and in tables', () => {
    expect(anchor('One para.\n\nTwo para.\n', 'para.\nTwo')).toMatch(/^refused/);
    expect(anchor('Use `npm test` now.\n', 'npm')).toMatch(/^refused/);
    expect(anchor('```\ncode here\n```\n', 'code')).toMatch(/^refused/);
    expect(anchor('| a | b |\n|---|---|\n| cell | x |\n', 'cell')).toMatch(/^refused/);
  });
});

describe('renderedRange and highlightBlock (A6)', () => {
  it('finds the rendered text of a source range without the markup', () => {
    const body = 'Ship **next week** please.\n';
    const root = mount(body);
    const [block] = sourceBlocks(root);
    const start = body.indexOf('**next');
    expect(renderedRange(block, body, start, start + '**next week**'.length)).toEqual({ start: 5, end: 14 });
  });

  it('keeps overlapping highlights individually addressable and removes them cleanly', () => {
    const body = 'alpha beta gamma\n';
    const root = mount(body);
    const [block] = sourceBlocks(root);
    highlightBlock(block.element, [
      { start: 0, end: 10, id: 't_one' },
      { start: 6, end: 16, id: 't_two' },
    ]);
    const marks = Array.from(root.querySelectorAll('mark.lm-comment')).map((mark) => [mark.textContent, (mark as HTMLElement).dataset.threads]);
    expect(marks).toEqual([['alpha ', 't_one'], ['beta', 't_one t_two'], [' gamma', 't_two']]);
    clearHighlights(root);
    expect(root.querySelectorAll('mark').length).toBe(0);
    expect(block.element.textContent).toBe('alpha beta gamma');
    expect(block.element.childNodes.length).toBe(1);
  });
});
