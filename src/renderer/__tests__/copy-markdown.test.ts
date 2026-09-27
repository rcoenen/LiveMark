// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { googleDocsTables, htmlToMarkdown, htmlToPlainText, markdownForCopy, selectionCoversElement } from '../copy-markdown';
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

describe('htmlToPlainText', () => {
  it('drops markdown syntax and keeps blocks on blank-line-separated paragraphs', () => {
    const text = htmlToPlainText(renderMarkdown('## Heading\n\nSome **bold** text with a [link](https://example.com).\n\nAfter.').innerHTML);
    expect(text).toBe('Heading\n\nSome bold text with a link.\n\nAfter.');
  });

  it('keeps list markers on adjacent lines and numbers ordered items', () => {
    const text = htmlToPlainText(renderMarkdown('- one\n- two\n\n1. first\n2. second').innerHTML);
    expect(text).toBe('- one\n- two\n\n1. first\n2. second');
  });

  it('turns table rows into tab-separated lines', () => {
    const text = htmlToPlainText(renderMarkdown(TABLE).innerHTML);
    expect(text).toContain('A\tB\tC\none\ttwo\tthree [1]\nfour\tfive\tsix');
    expect(text).toContain('Heading');
    expect(text).toContain('After.');
  });

  it('preserves code block layout', () => {
    const text = htmlToPlainText(renderMarkdown('Before.\n\n```\nif (x) {\n  y();\n}\n```\n\nAfter.').innerHTML);
    expect(text).toBe('Before.\n\nif (x) {\n  y();\n}\n\nAfter.');
  });

  it('keeps image alt text and drops everything else of the image', () => {
    const text = htmlToPlainText(renderMarkdown('![a diagram](images/x.png)').innerHTML);
    expect(text).toBe('a diagram');
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
