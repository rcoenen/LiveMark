// Every piece of interface copy lives here so the app can be localised later. Document content is never translated.
const STRINGS = {
  'app.name': 'LiveMark',
  'rail.label': 'Open documents',
  'rail.goToFile': 'Go to file',
  'rail.documents': 'Documents',
  'rail.documentsCount': 'Documents · {count}',
  'rail.watching.one': 'watching {count} file',
  'rail.watching.other': 'watching {count} files',
  'rail.closeHint': '⌘W close',
  'rail.theme': 'Dark',
  'rail.themeTitle': 'Toggle light/dark mode',
  'rail.versionLabel': 'Application version',
  'tab.updates': '{name}, {count} updates',
  'tab.close': 'Close {name}',
  'tab.openLeft': 'Open in left pane',
  'tab.openRight': 'Open in right pane',
  'tab.openLeftNamed': 'Open {name} in left pane',
  'tab.openRightNamed': 'Open {name} in right pane',
  'tab.left': 'L',
  'tab.right': 'R',
  'pane.close': 'Close pane',
  'pane.placeholder': 'Choose a document from the rail, or drag one here.',
  'status.idle': 'Live · no changes',
  'status.count.one': 'Live · {count} change',
  'status.count.other': 'Live · {count} changes',
  'status.editing.one': 'Being edited · {count} change',
  'status.editing.other': 'Being edited · {count} changes',
  'status.reloaded': 'Reloaded · {time}',
  'status.missing': 'File not found',
  'status.paused': 'Paused',
  'status.pausedWaiting.one': 'Paused · {count} change waiting',
  'status.pausedWaiting.other': 'Paused · {count} changes waiting',
  'status.opened': 'opened {time}',
  'status.sinceOpened': 'since opened {opened} · last {last}',
  'status.showing': 'showing {time}',
  'status.scrollPreserved': 'scroll position preserved',
  'status.jump': 'Jump to newest change',
  'status.locate': 'Locate',
  'status.loadNow': 'Load now',
  'status.pause': 'Pause',
  'status.resume': 'Resume',
  'status.allReloads': 'All reloads',
  'margin.label': 'Document details',
  'margin.outline': 'On this page',
  'margin.linksOut': 'Links out to',
  'margin.changedSection': 'Changed since opened',
  'facts.path': 'Path',
  'facts.modified': 'Modified',
  'facts.size': 'Size',
  'facts.opened': 'Opened',
  'facts.words.one': '{count} word',
  'facts.words.other': '{count} words',
  'history.label': 'Reload history and settings',
  'history.title': 'Reloads',
  'history.since': 'since {time}',
  'history.empty': 'No reloads since this document was opened.',
  'history.onScreenNow': 'on screen now',
  'history.stillOnScreen': 'still on screen',
  'history.gone': 'no longer in document',
  'history.nothing': 'nothing to show',
  'history.blocks.one': '{count} block',
  'history.blocks.other': '{count} blocks',
  'history.clearMarks': 'Clear marks',
  'history.step': 'Step',
  'settings.title': 'Settings',
  'settings.markBlocks': 'Mark changed blocks',
  'settings.fadeMarks': 'Marks fade after 8s',
  'settings.notify': 'Notify on every reload',
  'mark.label.one': 'Changed {time} · {count} block',
  'mark.label.other': 'Changed {time} · {count} blocks',
  'reload.contentRemoved': 'Content removed',
  'reload.noVisibleChanges': 'No visible changes',
  'reload.headingAdded': 'Heading added',
  'reload.headingChanged': 'Heading changed',
  'reload.added': '{noun} added',
  'reload.rewritten': '{noun} rewritten',
  'reload.blocksChanged': '{count} blocks changed',
  'reload.inSection': '{section} · {what}',
  'reload.noun.P': 'paragraph',
  'reload.noun.TABLE': 'table',
  'reload.noun.UL': 'list',
  'reload.noun.OL': 'list',
  'reload.noun.PRE': 'code block',
  'reload.noun.BLOCKQUOTE': 'quote',
  'reload.noun.TR': 'row',
  'reload.noun.LI': 'item',
  'reload.noun.other': 'block',
  'toast.newVersion': 'New version loaded',
  'toast.reloaded': '{name} reloaded',
  'toast.detail': '{summary} · {time}',
  'toast.blocksChanged.one': '{count} block changed',
  'toast.blocksChanged.other': '{count} blocks changed',
  'toast.view': 'View',
  'toast.copied': 'Markdown copied to clipboard',
  'toast.linkFailed': 'Could not open link',
  'toast.openFailed': 'Could not open file',
  'toast.located': 'Document located',
  'toast.changeGone': 'That change is no longer in the document',
  'toast.noChanges': 'No changes to show',
  'toast.textZoom': 'Text size {percent}%',
  'toast.tooNarrow': 'Window too narrow to split',
  'toast.tooNarrowDetail': 'Widen the window to read two documents side by side.',
  'palette.label': 'Go to file',
  'palette.placeholder': 'Go to file',
  'palette.open': 'open',
  'palette.empty': 'No matching files',
  'palette.noDocuments': 'Open a document first to browse its folder.',
  'find.label': 'Find in document',
  'find.placeholder': 'Find in document',
  'find.count': '{current}/{total}',
  'find.none': 'No results',
  'find.close': 'Close find',
  'empty.title': 'LiveMark',
  'empty.lead': 'Open a Markdown file to get started',
  'empty.open': 'Open File...',
  'empty.hint': 'Or drag and drop files, or pass file paths as arguments',
} as const;

export type StringKey = keyof typeof STRINGS;
type PluralBase = { [K in StringKey]: K extends `${infer Base}.one` ? Base : never }[StringKey];

export function t(key: StringKey, params: Record<string, string | number> = {}): string {
  return STRINGS[key].replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    return typeof value === 'number' ? value.toLocaleString('en-US') : value ?? '';
  });
}

/** Picks the `.one` or `.other` form of a counted string. */
export function tCount(base: PluralBase, count: number, params: Record<string, string | number> = {}): string {
  return t(`${base}.${count === 1 ? 'one' : 'other'}` as StringKey, { ...params, count });
}

/** Fills the static markup: `data-string` sets text, `data-string-<attribute>` sets that attribute. */
export function applyStaticStrings(root: ParentNode = document): void {
  for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === 'data-string') {
        element.textContent = t(attribute.value as StringKey);
      } else if (attribute.name.startsWith('data-string-')) {
        element.setAttribute(attribute.name.substring('data-string-'.length), t(attribute.value as StringKey));
      }
    }
  }
}
