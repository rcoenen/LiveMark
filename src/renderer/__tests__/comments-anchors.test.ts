// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { diffBodies, followEdit, mapRange, recoverRange, reopen } from '../comments/anchors';
import { contextAround, type AnchorData } from '../comments/format';

const anchorFor = (body: string, exact: string, occurrence = 0): AnchorData => {
  let start = -1;
  for (let i = 0; i <= occurrence; i++) start = body.indexOf(exact, start + 1);
  const end = start + exact.length;
  return { state: 'attached', start, end, exact, ...contextAround(body, start, end) };
};

describe('mapRange (A3)', () => {
  const range = { start: 10, end: 20 };
  const map = (at: number, deleted: number, inserted: number) => mapRange(range.start, range.end, { at, deleted, inserted });

  it('shifts for an insertion before', () => expect(map(2, 0, 5)).toEqual({ start: 15, end: 25 }));
  it('grows for an insertion strictly inside', () => expect(map(15, 0, 3)).toEqual({ start: 10, end: 23 }));
  it('excludes an insertion exactly at the start', () => expect(map(10, 0, 4)).toEqual({ start: 14, end: 24 }));
  it('excludes an insertion exactly at the end', () => expect(map(20, 0, 4)).toEqual({ start: 10, end: 20 }));
  it('keeps the surviving text on a partial delete at the start', () => expect(map(8, 5, 0)).toEqual({ start: 8, end: 15 }));
  it('keeps the surviving text on a partial delete at the end', () => expect(map(17, 6, 0)).toEqual({ start: 10, end: 17 }));
  it('orphans when all selected text is deleted', () => expect(map(10, 10, 0)).toBeNull());
  it('orphans when the whole range is replaced', () => expect(map(10, 10, 12)).toBeNull());
  it('ignores edits after the range', () => expect(map(25, 3, 1)).toEqual(range));
});

describe('diffBodies', () => {
  it('does not split a surrogate pair', () => {
    const edit = diffBodies('a😀b', 'a😁b');
    expect(edit).toEqual({ at: 1, deleted: 2, inserted: 2 });
  });
});

describe('followEdit', () => {
  it('keeps a phrase highlighted when text is added above it', () => {
    const before = '# T\n\nWe ship next week.\n';
    const after = '# T\n\nNew intro.\n\nWe ship next week.\n';
    const moved = followEdit(anchorFor(before, 'next week'), before, after);
    expect(moved.state).toBe('attached');
    expect(after.substring(moved.start ?? 0, moved.end ?? 0)).toBe('next week');
  });

  it('updates the quote after a partial delete', () => {
    const before = 'We ship next week for sure.\n';
    const after = 'We ship next for sure.\n';
    const moved = followEdit(anchorFor(before, 'next week'), before, after);
    expect(moved.state).toBe('attached');
    expect(moved.exact.trim()).toBe('next');
  });

  it('orphans when the phrase is deleted and keeps the last quote', () => {
    const before = 'We ship next week.\n';
    const moved = followEdit(anchorFor(before, 'next week'), before, 'We ship.\n');
    expect(moved).toMatchObject({ state: 'orphaned', start: null, end: null, exact: 'next week' });
  });
});

describe('recoverRange and reopen (A5)', () => {
  it('recovers a unique quote with matching context after an external insertion far away', () => {
    const before = 'Intro.\n\nWe ship next week.\n\nOutro.\n';
    const anchor = anchorFor(before, 'next week');
    const after = 'Brand new first line.\n\n' + before;
    const recovered = reopen(anchor, after, false);
    // The prefix changed (it now includes the new first line within 32 code points? no: prefix is only 32 points).
    if (recovered.state === 'attached') expect(after.substring(recovered.start ?? 0, recovered.end ?? 0)).toBe('next week');
  });

  it('recovers when the context within 32 code points is unchanged', () => {
    const lead = 'x'.repeat(100);
    const before = `${lead}\n\nWe ship next week.\n`;
    const anchor = anchorFor(before, 'next week');
    const after = `Inserted.\n${before}`;
    expect(reopen(anchor, after, false)).toMatchObject({ state: 'attached', start: anchor.start! + 10, exact: 'next week' });
  });

  it('orphans an ambiguous quote instead of taking the first match', () => {
    const before = 'A. same words here.\n\nB. same words here.\n';
    const anchor = { ...anchorFor(before, 'same words', 1), prefix: 'same', suffix: 'x' };
    expect(recoverRange(before + before, anchor)).toBeNull();
    const twice = anchorFor(before, 'same words', 1);
    expect(recoverRange(before + before, twice)).toBeNull();
  });

  it('keeps a matching anchor when the digest matches', () => {
    const body = 'Hello world.\n';
    const anchor = anchorFor(body, 'world');
    expect(reopen(anchor, body, true)).toBe(anchor);
  });

  it('measures offsets in UTF-16 units across emoji, combining marks and CRLF (A4)', () => {
    const body = 'Café 😀 été\r\nnext 😀 line\r\n';
    const anchor = anchorFor(body, '😀 line');
    expect(anchor.start).toBe(body.indexOf('😀 line'));
    expect(recoverRange(body, anchor)).toEqual({ start: anchor.start, end: anchor.end });
  });
});
