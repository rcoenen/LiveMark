/** Where the movable sections live, which sections are collapsed, and which side panels the user hid. */
export type PanelId = 'rail' | 'details';
export type MovableSection = 'changes' | 'outline' | 'comments';
export type CollapsibleSection = 'documents' | 'changes' | 'outline' | 'links' | 'comments';
/** `strip`: the user folded the right panel. `unavailable`: the window is too narrow, split, or empty. */
export type DetailsState = 'shown' | 'strip' | 'unavailable';

export interface PanelLayout {
  place: Record<MovableSection, PanelId>;
  collapsed: Record<CollapsibleSection, boolean>;
  railHidden: boolean;
  detailsHidden: boolean;
}

export const MOVABLE_SECTIONS: MovableSection[] = ['changes', 'comments', 'outline'];

/** Top-to-bottom order of the movable sections inside each panel. */
export const SECTION_ORDER: Record<PanelId, MovableSection[]> = {
  rail: ['outline', 'changes', 'comments'],
  details: ['changes', 'comments', 'outline'],
};

export function defaultLayout(): PanelLayout {
  return {
    place: { changes: 'details', outline: 'rail', comments: 'details' },
    collapsed: { documents: false, changes: false, outline: false, links: false, comments: false },
    railHidden: false,
    detailsHidden: false,
  };
}

const isPanel = (value: unknown): value is PanelId => value === 'rail' || value === 'details';

/** Reads a stored layout, keeping only values it recognises. */
export function parseLayout(raw: string | null): PanelLayout {
  const layout = defaultLayout();
  if (!raw) return layout;
  let stored: Partial<PanelLayout>;
  try {
    stored = JSON.parse(raw) as Partial<PanelLayout>;
  } catch {
    return layout;
  }
  if (!stored || typeof stored !== 'object') return layout;
  for (const section of MOVABLE_SECTIONS) {
    const place = stored.place?.[section];
    if (isPanel(place)) layout.place[section] = place;
  }
  for (const section of Object.keys(layout.collapsed) as CollapsibleSection[]) {
    const collapsed = stored.collapsed?.[section];
    if (typeof collapsed === 'boolean') layout.collapsed[section] = collapsed;
  }
  if (typeof stored.railHidden === 'boolean') layout.railHidden = stored.railHidden;
  if (typeof stored.detailsHidden === 'boolean') layout.detailsHidden = stored.detailsHidden;
  return layout;
}

/**
 * Where each movable section is shown. A section placed in the right panel falls back to the rail
 * while that panel cannot be shown, and stays out of sight while the user has folded it into the strip.
 */
export function resolvePlacement(layout: PanelLayout, details: DetailsState): Record<MovableSection, PanelId | null> {
  const placed = {} as Record<MovableSection, PanelId | null>;
  for (const section of MOVABLE_SECTIONS) {
    const preferred = layout.place[section];
    if (preferred === 'rail' || details === 'shown') placed[section] = preferred;
    else placed[section] = details === 'strip' ? null : 'rail';
  }
  return placed;
}

export function otherPanel(panel: PanelId): PanelId {
  return panel === 'rail' ? 'details' : 'rail';
}
