// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { canAppendFooter, composeFile, newRoot, newThreadJson, parseReview, safeJson } from '../comments/format';
import { get, parseJson, set, stringifyJson, type JsonObject } from '../comments/json';
import { sha256Hex } from '../comments/sha256';

const SPEC_EXAMPLE = `# Voorstel

We lanceren volgende week.


<!--livemark:comments
{
  "format": "livemark-comments",
  "version": 1,
  "offsetUnit": "utf16",
  "bodySha256": "193b48b844404b8e65f97f9d52c0a7a86d262e1fdc5372f2bb8c1d68ab64116b",
  "threads": [
    {
      "id": "t_8fced4b9d53541d5a80f7c6b5e187843",
      "status": "open",
      "anchor": {
        "state": "attached",
        "start": 24,
        "end": 37,
        "exact": "volgende week",
        "prefix": "# Voorstel\\n\\nWe lanceren ",
        "suffix": ".\\n"
      },
      "messages": [
        {
          "id": "m_875760a6d62e4c18ab930d409e0b835f",
          "author": {
            "id": "local:rob",
            "name": "Rob"
          },
          "createdAt": "2026-10-07T12:00:00Z",
          "content": "Kunnen we de datum expliciet maken?"
        }
      ]
    }
  ]
}
-->
`;

const bodyOf = (text: string): string => parseReview(text).body;

describe('sha256Hex', () => {
  it('matches the digest in the spec example', () => {
    expect(sha256Hex('# Voorstel\n\nWe lanceren volgende week.\n')).toBe('193b48b844404b8e65f97f9d52c0a7a86d262e1fdc5372f2bb8c1d68ab64116b');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('parseReview', () => {
  it('reads the spec example and recovers the exact body', () => {
    const parsed = parseReview(SPEC_EXAMPLE);
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    expect(parsed.body).toBe('# Voorstel\n\nWe lanceren volgende week.\n');
    expect(parsed.digestMatches).toBe(true);
    expect(parsed.threads[0].anchor).toMatchObject({ state: 'attached', start: 24, end: 37, exact: 'volgende week' });
    expect(parsed.threads[0].messages[0]).toMatchObject({ authorName: 'Rob', content: 'Kunnen we de datum expliciet maken?' });
  });

  it('re-serialises the spec example byte for byte (A9)', () => {
    const parsed = parseReview(SPEC_EXAMPLE);
    if (parsed.kind !== 'ok') throw new Error('expected ok');
    expect(composeFile(parsed.body, parsed.root, parsed.eol)).toBe(SPEC_EXAMPLE);
  });

  it('accepts CRLF files and an omitted final line ending', () => {
    const crlf = SPEC_EXAMPLE.replace(/\n/g, '\r\n').replace(/\r\n$/, '');
    const parsed = parseReview(crlf);
    expect(parsed.kind === 'ok' || parsed.kind === 'readonly').toBe(true);
    expect(parsed.body).toBe('# Voorstel\r\n\r\nWe lanceren volgende week.\r\n');
  });

  it('treats marker text inside code as ordinary content (A8)', () => {
    const text = '# Doc\n\n```html\n<!--livemark:comments\n{}\n-->\n```\n';
    expect(parseReview(text)).toEqual({ kind: 'none', body: text, eol: '\n' });
  });

  it('does not find a footer swallowed by an unclosed fence, and refuses to create one there (A8)', () => {
    const body = '# Doc\n\n```js\nconst x = 1;\n';
    expect(canAppendFooter(body)).toBe(false);
    expect(canAppendFooter('# Doc\n\nText.\n')).toBe(true);
  });

  it('keeps the raw block and goes read-only for broken or unsupported data (A10)', () => {
    const cases: Array<[string, RegExp]> = [
      [SPEC_EXAMPLE.replace('"version": 1', '"version": 2'), /newer version/],
      [SPEC_EXAMPLE.replace('"status": "open",', '"status": "open",\n      "status": "resolved",'), /Duplicate key/],
      [SPEC_EXAMPLE.replace('"threads": [', '"threads": [ oops'), /not valid JSON/],
      [`${SPEC_EXAMPLE}\n<!--livemark:comments\n{}\n-->\n`, /more than one/],
      [SPEC_EXAMPLE.replace('"start": 24', '"start": 25'), /does not match/],
    ];
    for (const [text, reason] of cases) {
      const parsed = parseReview(text);
      expect(parsed.kind, reason.source).toBe('readonly');
      if (parsed.kind === 'readonly') expect(parsed.reason).toMatch(reason);
    }
  });

  it('offers to move a footer back to the end after another tool appended text', () => {
    const appended = SPEC_EXAMPLE + '\nAppended by an agent.\n';
    const parsed = parseReview(appended);
    expect(parsed.kind).toBe('readonly');
    if (parsed.kind !== 'readonly' || !parsed.repair) throw new Error('expected a repair');
    const repaired = parseReview(parsed.repair);
    expect(repaired.kind).toBe('ok');
    expect(repaired.body).toBe('# Voorstel\n\nWe lanceren volgende week.\n\nAppended by an agent.\n');
  });

  it('rejects duplicate message ids across threads', () => {
    const root = newRoot('a b\n', [
      newThreadJson({ start: 0, end: 1, exact: 'a', prefix: '', suffix: ' b\n' }, 'R', 'local:r', 'one'),
      newThreadJson({ start: 2, end: 3, exact: 'b', prefix: 'a ', suffix: '\n' }, 'R', 'local:r', 'two'),
    ]);
    const threads = get(root, 'threads');
    if (threads?.t !== 'arr') throw new Error('threads');
    const message = (index: number): JsonObject => {
      const thread = threads.items[index] as JsonObject;
      const messages = get(thread, 'messages');
      if (messages?.t !== 'arr') throw new Error('messages');
      return messages.items[0] as JsonObject;
    };
    set(message(1), 'id', get(message(0), 'id') as never);
    const parsed = parseReview(composeFile('a b\n', root, '\n'));
    expect(parsed.kind).toBe('readonly');
  });
});

describe('serialisation', () => {
  it('round-trips hostile message text as inert data (A7)', () => {
    const hostile = 'end --> here <!-- there -- and "quotes"\nnew line \\ backslash <script>alert(1)</script> & co';
    const body = '# T\n\nSome text.\n';
    const root = newRoot(body, [newThreadJson({ start: 5, end: 9, exact: 'Some', prefix: '# T\n\n', suffix: ' text.\n' }, 'Rob', 'local:rob', hostile)]);
    const file = composeFile(body, root, '\n');
    const footer = file.substring(body.length);
    expect(footer.split('\n').slice(3, -2).join('\n')).not.toMatch(/--|<|>|&/);
    const parsed = parseReview(file);
    if (parsed.kind !== 'ok') throw new Error(parsed.kind === 'readonly' ? parsed.reason : 'none');
    expect(parsed.body).toBe(body);
    expect(parsed.threads[0].messages[0].content).toBe(hostile);
  });

  it('keeps unknown fields and their order, including integer-like keys', () => {
    const text = '{"z": 1, "2": [1.50, {"b": true, "a": null}], "1": "x"}';
    expect(stringifyJson(parseJson(text))).toBe('{\n  "z": 1,\n  "2": [\n    1.50,\n    {\n      "b": true,\n      "a": null\n    }\n  ],\n  "1": "x"\n}');
  });

  it('rejects numbers that are not finite', () => {
    expect(() => parseJson('1e999')).toThrow();
  });

  it('uses CRLF throughout when asked', () => {
    const root = newRoot('x\r\n', []);
    expect(safeJson(root, '\r\n')).not.toMatch(/[^\r]\n/);
  });

  it('writes no footer when there are no threads, giving back the exact body', () => {
    expect(composeFile('body\n', newRoot('body\n', []), '\n')).toBe('body\n');
    expect(composeFile('body\n', null, '\n')).toBe('body\n');
  });

  it('keeps the body bytes when adding a footer, including trailing whitespace (A9)', () => {
    const body = '---\ntitle: x\n---\n\n<!-- keep me -->\n\nText.  \n\n';
    const root = newRoot(body, [newThreadJson({ start: 34, end: 38, exact: 'Text', prefix: '', suffix: '' }, 'R', 'local:r', 'hi')]);
    const file = composeFile(body, root, '\n');
    expect(file.startsWith(body)).toBe(true);
    expect(bodyOf(file)).toBe(body);
  });
});
