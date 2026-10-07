// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyAction, loadComments, readOnlyReason, restoreFile, threadsOf, type Author } from '../comments/state';

const ROB: Author = { id: 'local:rob', name: 'Rob' };
const BODY = '# Plan\n\nWe launch next week.\n\nThe budget is fixed.\n';
const at = (text: string, phrase: string) => ({ start: text.indexOf(phrase), end: text.indexOf(phrase) + phrase.length });

function addComment(text: string, phrase: string, content: string): string {
  return applyAction(loadComments(text), { kind: 'add', ...at(text, phrase), content }, ROB);
}

describe('comment actions', () => {
  it('stores a new thread in the file and reads it back elsewhere (A1)', () => {
    const file = addComment(BODY, 'next week', 'Which date exactly?');
    expect(file.startsWith(BODY)).toBe(true);
    const fresh = loadComments(file);
    const [thread] = threadsOf(fresh);
    expect(thread.anchor).toMatchObject({ state: 'attached', exact: 'next week' });
    expect(thread.messages[0]).toMatchObject({ authorName: 'Rob', content: 'Which date exactly?' });
    expect(thread.messages[0].createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });

  it('replies, edits, resolves, reopens and deletes while keeping ids stable (A2)', () => {
    let file = addComment(BODY, 'next week', 'Which date?');
    const threadId = threadsOf(loadComments(file))[0].id;
    file = applyAction(loadComments(file), { kind: 'reply', threadId, content: 'The 14th.' }, ROB);
    let [thread] = threadsOf(loadComments(file));
    const [first, second] = thread.messages;
    expect(thread.id).toBe(threadId);
    file = applyAction(loadComments(file), { kind: 'edit', threadId, messageId: second.id, content: 'The 15th.' }, ROB);
    [thread] = threadsOf(loadComments(file));
    expect(thread.messages[1]).toMatchObject({ id: second.id, content: 'The 15th.' });
    expect(thread.messages[1].updatedAt).toBeDefined();
    file = applyAction(loadComments(file), { kind: 'status', threadId, status: 'resolved' }, ROB);
    expect(threadsOf(loadComments(file))[0].status).toBe('resolved');
    file = applyAction(loadComments(file), { kind: 'reply', threadId, content: 'One more.' }, ROB);
    expect(threadsOf(loadComments(file))[0].status).toBe('resolved');
    file = applyAction(loadComments(file), { kind: 'status', threadId, status: 'open' }, ROB);
    file = applyAction(loadComments(file), { kind: 'delete-message', threadId, messageId: first.id }, ROB);
    expect(threadsOf(loadComments(file))[0].messages.map((m) => m.id)).not.toContain(first.id);
    file = applyAction(loadComments(file), { kind: 'delete-thread', threadId }, ROB);
    expect(file).toBe(BODY);
  });

  it('deleting the last message deletes the thread and the footer', () => {
    const file = addComment(BODY, 'next week', 'Only message');
    const [thread] = threadsOf(loadComments(file));
    expect(applyAction(loadComments(file), { kind: 'delete-message', threadId: thread.id, messageId: thread.messages[0].id }, ROB)).toBe(BODY);
  });

  it('never changes the body bytes for a comment-only change (A9)', () => {
    const crlf = BODY.replace(/\n/g, '\r\n') + '  \r\n';
    const file = addComment(crlf, 'budget', 'Fixed at what?');
    expect(file.startsWith(crlf)).toBe(true);
    expect(file.substring(crlf.length)).toMatch(/^\r\n\r\n<!--livemark:comments\r\n/);
    expect(loadComments(file).parse.body).toBe(crlf);
  });

  it('follows an external edit and stores the repaired anchor with the next change (A5)', () => {
    const file = addComment(BODY, 'budget', 'Fixed at what?');
    const before = loadComments(file);
    const edited = file.replace('# Plan\n\n', '# Plan\n\nA new opening paragraph.\n\n');
    const after = loadComments(edited, before);
    const [thread] = threadsOf(after);
    const anchor = after.anchors.get(thread.id);
    expect(anchor?.state).toBe('attached');
    expect(after.parse.body.substring(anchor?.start ?? 0, anchor?.end ?? 0)).toBe('budget');
    const saved = applyAction(after, { kind: 'reply', threadId: thread.id, content: 'ok' }, ROB);
    const reread = loadComments(saved);
    expect(reread.parse.kind === 'ok' && reread.parse.digestMatches).toBe(true);
    expect(threadsOf(reread)[0].anchor).toMatchObject({ state: 'attached', exact: 'budget' });
  });

  it('keeps every message when the commented text is deleted (A5)', () => {
    const file = addComment(BODY, 'budget', 'Fixed at what?');
    const before = loadComments(file);
    const after = loadComments(file.replace('The budget is fixed.\n', 'Nothing here.\n'), before);
    const [thread] = threadsOf(after);
    expect(after.anchors.get(thread.id)?.state).toBe('orphaned');
    expect(after.orphanedNow).toBe(1);
    const saved = applyAction(after, { kind: 'reply', threadId: thread.id, content: 'Moved?' }, ROB);
    const [stored] = threadsOf(loadComments(saved));
    expect(stored.anchor).toMatchObject({ state: 'orphaned', exact: 'budget' });
    expect(stored.messages.map((m) => m.content)).toEqual(['Fixed at what?', 'Moved?']);
    const reattached = applyAction(loadComments(saved), { kind: 'reattach', threadId: stored.id, ...at(saved, 'Nothing') }, ROB);
    expect(threadsOf(loadComments(reattached))[0].anchor).toMatchObject({ state: 'attached', exact: 'Nothing' });
  });

  it('undoes a deletion on top of a body that changed meanwhile', () => {
    const file = addComment(BODY, 'budget', 'Keep me');
    const [thread] = threadsOf(loadComments(file));
    const deleted = applyAction(loadComments(file), { kind: 'delete-thread', threadId: thread.id }, ROB);
    const agentEdit = deleted.replace('# Plan\n', '# Plan v2\n');
    const restored = restoreFile({ text: file }, loadComments(agentEdit));
    expect(restored.startsWith(agentEdit)).toBe(true);
    const [back] = threadsOf(loadComments(restored));
    expect(back).toMatchObject({ id: thread.id, anchor: { state: 'attached', exact: 'budget' } });
  });

  it('refuses changes to read-only comment data (A10)', () => {
    const file = addComment(BODY, 'budget', 'x').replace('"version": 1', '"version": 9');
    const state = loadComments(file);
    expect(readOnlyReason(state)).toMatch(/newer version/);
    expect(() => applyAction(state, { kind: 'add', ...at(file, 'launch'), content: 'y' }, ROB)).toThrow();
  });
});
