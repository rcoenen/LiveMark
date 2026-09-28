import { describe, expect, it } from 'vitest';
import { RAIL_WIDTH_DEFAULT, RAIL_WIDTH_MAX, RAIL_WIDTH_MIN, dockedRailWidth, railWidthLimit } from '../rail-width';

describe('dockedRailWidth', () => {
  it('keeps the default on a wide window', () => {
    expect(dockedRailWidth(RAIL_WIDTH_DEFAULT, 1600)).toBe(232);
  });

  it('lets the rail grow up to the cap without eating the reading measure', () => {
    expect(railWidthLimit(1600)).toBe(RAIL_WIDTH_MAX);
    expect(dockedRailWidth(500, 1600)).toBe(RAIL_WIDTH_MAX);
  });

  it('shrinks the rail so a 680px measure still fits', () => {
    expect(dockedRailWidth(400, 1100)).toBe(1100 - 80 - 680);
  });

  it('also leaves room for the margin column on a wide window', () => {
    expect(dockedRailWidth(400, 1400)).toBe(1400 - 80 - 680 - 268 - 56);
  });

  it('does not go below the minimum', () => {
    expect(dockedRailWidth(100, 1600)).toBe(RAIL_WIDTH_MIN);
  });
});
