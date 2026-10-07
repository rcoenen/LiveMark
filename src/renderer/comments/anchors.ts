import { contextAround, type AnchorData } from './format';

/** One contiguous replacement: `deleted` UTF-16 units at `at` became `inserted` units. */
export interface Edit {
  at: number;
  deleted: number;
  inserted: number;
}

const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** The single edit that turns `before` into `after`, from their common prefix and suffix. */
export function diffBodies(before: string, after: string): Edit | null {
  if (before === after) return null;
  let prefix = 0;
  const limit = Math.min(before.length, after.length);
  while (prefix < limit && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++;
  // Never split a surrogate pair.
  if (prefix > 0 && isLowSurrogate(before.charCodeAt(prefix))) prefix--;
  let suffix = 0;
  while (
    suffix < limit - prefix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) suffix++;
  if (suffix > 0 && isLowSurrogate(before.charCodeAt(before.length - suffix))) suffix--;
  return { at: prefix, deleted: before.length - prefix - suffix, inserted: after.length - prefix - suffix };
}

/**
 * Moves a range through one edit, following the spec's edit table: shift when the edit is before,
 * grow for insertions strictly inside, exclude insertions at either boundary, keep surviving text on a
 * partial delete, and return null (orphan) when the selected text is entirely deleted or replaced.
 */
export function mapRange(start: number, end: number, edit: Edit): { start: number; end: number } | null {
  const editEnd = edit.at + edit.deleted;
  const delta = edit.inserted - edit.deleted;
  // Entirely before the range, including an insertion exactly at its start: the text shifts.
  if (editEnd <= start) return { start: start + delta, end: end + delta };
  // Entirely after the range, including an insertion exactly at its end: nothing moves.
  if (edit.at >= end) return { start, end };
  // The selected text is gone or replaced as a whole.
  if (edit.at <= start && editEnd >= end) return null;
  // Strictly inside: the range grows or shrinks with the edit.
  if (edit.at > start && editEnd < end) return { start, end: end + delta };
  // Over the beginning: what survives starts after the inserted text.
  if (edit.at <= start) return { start: edit.at + edit.inserted, end: end + delta };
  // Over the end: keep what came before the edit.
  return { start, end: edit.at };
}

/** Attaches to the one place where the exact quote and its full context match, or reports none. */
export function recoverRange(body: string, anchor: Pick<AnchorData, 'exact' | 'prefix' | 'suffix'>): { start: number; end: number } | null {
  if (!anchor.exact) return null;
  let found: { start: number; end: number } | null = null;
  for (let index = body.indexOf(anchor.exact); index >= 0; index = body.indexOf(anchor.exact, index + 1)) {
    const end = index + anchor.exact.length;
    const context = contextAround(body, index, end);
    if (context.prefix !== anchor.prefix || context.suffix !== anchor.suffix) continue;
    if (found) return null;
    found = { start: index, end };
  }
  return found;
}

export function attachedAt(body: string, start: number, end: number): AnchorData {
  return { state: 'attached', start, end, exact: body.substring(start, end), ...contextAround(body, start, end) };
}

export function orphaned(anchor: AnchorData): AnchorData {
  return { state: 'orphaned', start: null, end: null, exact: anchor.exact, prefix: anchor.prefix, suffix: anchor.suffix };
}

/** Moves a live anchor from the previous body to the next one, after a change made outside LiveMark. */
export function followEdit(anchor: AnchorData, before: string, after: string): AnchorData {
  if (anchor.state !== 'attached' || anchor.start === null || anchor.end === null) return anchor;
  const edit = diffBodies(before, after);
  if (!edit) return anchor;
  const mapped = mapRange(anchor.start, anchor.end, edit);
  return mapped ? attachedAt(after, mapped.start, mapped.end) : orphaned(anchor);
}

/** On reopening a file whose body changed since the footer was written: quote and context, or unattached. */
export function reopen(anchor: AnchorData, body: string, digestMatches: boolean): AnchorData {
  if (anchor.state !== 'attached') return anchor;
  if (digestMatches && anchor.start !== null && anchor.end !== null) return anchor;
  const recovered = recoverRange(body, anchor);
  return recovered ? attachedAt(body, recovered.start, recovered.end) : orphaned(anchor);
}
