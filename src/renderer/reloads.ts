import { blockKey, changeableItems } from './markdown';
import { t, type StringKey } from './strings';

export interface BlockIndex {
  blockKeys: string[];
  /** Every top-level block, table row and list item currently in the document. */
  allKeys: Set<string>;
}

export interface ReloadEntry {
  time: number;
  text: string;
  blocks: number;
  /** Fingerprints of the blocks, rows and items this reload changed or added. */
  keys: Set<string>;
  /** Ids of the h2/h3 sections that contain those changes. */
  sections: string[];
}

function blockNoun(element: Element): string {
  const key = `reload.noun.${element.tagName}`;
  return t((['P', 'TABLE', 'UL', 'OL', 'PRE', 'BLOCKQUOTE', 'TR', 'LI'].includes(element.tagName) ? key : 'reload.noun.other') as StringKey);
}

export function indexBlocks(container: HTMLElement): BlockIndex {
  const blocks = Array.from(container.children);
  const blockKeys = blocks.map(blockKey);
  const allKeys = new Set(blockKeys);
  for (const block of blocks) {
    for (const item of changeableItems(block)) {
      allKeys.add(blockKey(item));
    }
  }
  return { blockKeys, allKeys };
}

function topLevelBlock(element: Element, container: HTMLElement): Element {
  let block = element;
  while (block.parentElement && block.parentElement !== container) {
    block = block.parentElement;
  }
  return block;
}

function sectionOf(block: Element): Element | null {
  for (let candidate: Element | null = block; candidate; candidate = candidate.previousElementSibling) {
    if (/^H[23]$/.test(candidate.tagName)) return candidate;
  }
  return null;
}

/** Compares a new render against the index of the previous one and describes what the reload changed. */
export function diffReload(previous: BlockIndex, container: HTMLElement, time: number): ReloadEntry {
  const remaining = new Map<string, number>();
  for (const key of previous.blockKeys) {
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const blocks = Array.from(container.children);
  const changed: Element[] = [];
  for (const block of blocks) {
    const key = blockKey(block);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      continue;
    }
    const items = changeableItems(block);
    const changedItems = items.filter((item) => !previous.allKeys.has(blockKey(item)));
    if (changedItems.length > 0 && changedItems.length < items.length) {
      changed.push(...changedItems);
    } else {
      changed.push(block);
    }
  }

  const sections = new Set<string>();
  for (const element of changed) {
    const heading = sectionOf(topLevelBlock(element, container));
    if (heading) sections.add(heading.id);
  }

  let text = t(blocks.length < previous.blockKeys.length ? 'reload.contentRemoved' : 'reload.noVisibleChanges');
  if (changed.length > 0) {
    const first = changed[0];
    const grew = blocks.length - previous.blockKeys.length >= changed.length;
    if (changed.length === 1 && /^H[1-6]$/.test(first.tagName)) {
      text = t(grew ? 'reload.headingAdded' : 'reload.headingChanged');
    } else {
      const what = changed.length === 1
        ? t(grew ? 'reload.added' : 'reload.rewritten', { noun: blockNoun(first) })
        : t('reload.blocksChanged', { count: changed.length });
      const section = sectionOf(topLevelBlock(first, container))?.textContent?.trim();
      text = section ? t('reload.inSection', { section, what }) : what.charAt(0).toUpperCase() + what.substring(1);
    }
  }

  return { time, text, blocks: changed.length, keys: new Set(changed.map(blockKey)), sections: Array.from(sections) };
}

/** Whether any block a reload touched is still in the document unchanged. */
export function isReloadOnScreen(entry: ReloadEntry, current: BlockIndex): boolean {
  for (const key of entry.keys) {
    if (current.allKeys.has(key)) return true;
  }
  return false;
}

/** Ranks `candidate` for a fuzzy query: null when it does not match, lower is better. */
export function fuzzyScore(query: string, candidate: string): number | null {
  const needle = query.toLowerCase();
  const haystack = candidate.toLowerCase();
  if (!needle) return 0;
  const direct = haystack.indexOf(needle);
  if (direct >= 0) return direct;

  let score = 1000;
  let position = 0;
  for (const character of needle) {
    const found = haystack.indexOf(character, position);
    if (found < 0) return null;
    score += found - position;
    position = found + 1;
  }
  return score;
}
