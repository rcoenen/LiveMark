import { describe, expect, it } from 'vitest';
import { defaultLayout, otherPanel, parseLayout, resolvePlacement } from '../panels';

describe('parseLayout', () => {
  it('starts with navigation in the rail and changes in the right panel', () => {
    expect(parseLayout(null)).toEqual(defaultLayout());
    expect(defaultLayout().place).toEqual({ changes: 'details', outline: 'rail' });
  });

  it('keeps recognised values and drops the rest', () => {
    const layout = parseLayout(JSON.stringify({
      place: { changes: 'rail', outline: 'sideways' },
      collapsed: { outline: true, documents: 'yes' },
      railHidden: true,
      detailsHidden: 1,
    }));
    expect(layout.place).toEqual({ changes: 'rail', outline: 'rail' });
    expect(layout.collapsed).toEqual({ documents: false, changes: false, outline: true, links: false });
    expect(layout.railHidden).toBe(true);
    expect(layout.detailsHidden).toBe(false);
  });

  it('falls back to the default for unreadable storage', () => {
    expect(parseLayout('{not json')).toEqual(defaultLayout());
    expect(parseLayout('null')).toEqual(defaultLayout());
  });
});

describe('resolvePlacement', () => {
  it('shows each section where it was placed while the right panel is shown', () => {
    expect(resolvePlacement(defaultLayout(), 'shown')).toEqual({ changes: 'details', outline: 'rail' });
  });

  it('moves right-panel sections into the rail while the right panel cannot be shown', () => {
    expect(resolvePlacement(defaultLayout(), 'unavailable')).toEqual({ changes: 'rail', outline: 'rail' });
  });

  it('keeps right-panel sections out of sight while the user has folded that panel', () => {
    expect(resolvePlacement(defaultLayout(), 'strip')).toEqual({ changes: null, outline: 'rail' });
  });

  it('never moves a rail section', () => {
    const layout = defaultLayout();
    layout.place.changes = 'rail';
    layout.place.outline = 'details';
    expect(resolvePlacement(layout, 'strip')).toEqual({ changes: 'rail', outline: null });
  });
});

describe('otherPanel', () => {
  it('flips between the two panels', () => {
    expect(otherPanel('rail')).toBe('details');
    expect(otherPanel('details')).toBe('rail');
  });
});
