// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { googleDocsTables, htmlToMarkdown, markdownForCopy, selectionCoversElement } from '../copy-markdown';
import { renderMarkdown } from '../markdown';

const TABLE = [
  '## Heading',
  '',
  '| A | B | C |',
  '|---|---|---|',
  '| one | two | three [1] |',
  '| four | five | six |',
  '',
  'After.',
].join('\n');

describe('googleDocsTables', () => {
  it('rewrites a plain separator into the form Google Docs pastes as a table', () => {
    expect(googleDocsTables(TABLE)).toContain('| A | B | C |');
    expect(googleDocsTables(TABLE)).toContain('| :---- | :---- | :---- |');
    expect(googleDocsTables(TABLE)).not.toContain('|---|---|---|');
    expect(googleDocsTables(TABLE)).toContain('| one | two | three [1] |');
    expect(googleDocsTables(TABLE)).toContain('After.');
  });

  it('keeps center and right alignment and ignores fences', () => {
    const markdown = [
      '| a | b | c |',
      '| :--- | :---: | ---: |',
      '| 1 | 2 | 3 |',
      '',
      '```',
      '|---|---|',
      '```',
    ].join('\n');

    const converted = googleDocsTables(markdown);
    expect(converted).toContain('| :---- | :----: | ----: |');
    expect(converted).toContain('```\n|---|---|\n```');
  });
});

describe('htmlToMarkdown', () => {
  it('turns a rendered table back into one pipe row per source row', () => {
    const converted = htmlToMarkdown(renderMarkdown(TABLE).innerHTML);

    expect(converted).toContain('| A | B | C |');
    expect(converted).toContain('| :---- | :---- | :---- |');
    expect(converted).toContain('| one | two | three \\[1\\] |');
    expect(converted).toContain('| four | five | six |');
    expect(converted).not.toMatch(/\|\s*\n\n\s*two/);
    expect(converted).toContain('## Heading');
  });

  it('escapes a pipe inside a cell and keeps bold', () => {
    const converted = htmlToMarkdown(renderMarkdown('| a | b |\n|---|---|\n| **x** \\| y | z |').innerHTML);
    expect(converted).toContain('| **x** \\| y | z |');
  });
});

describe('select all', () => {
  it('copies the document markdown, with a Google Docs table separator', () => {
    const source = '## Heading\n\n| A | B |\n|---|---|\n| one | two |\n';
    const content = renderMarkdown(source);
    document.body.appendChild(content);
    const range = document.createRange();
    range.selectNodeContents(content);

    expect(selectionCoversElement(range, content)).toBe(true);
    expect(markdownForCopy(source, '<table></table>', true)).toBe(googleDocsTables(source));
    expect(markdownForCopy(source, '<table></table>', true)).toContain('| :---- | :---- |');
    expect(markdownForCopy(source, '<table></table>', true)).toContain('| one | two |');

    range.setStart(content, 0);
    range.setEnd(content, 1);
    expect(selectionCoversElement(range, content)).toBe(false);
    content.remove();
  });
});
