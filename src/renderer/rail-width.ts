/** Docked documents rail. The reading measure stays 680px, so the rail cannot grow into it. */
export const RAIL_WIDTH_DEFAULT = 232;
export const RAIL_WIDTH_MIN = 180;
export const RAIL_WIDTH_MAX = 420;
const READING_MEASURE = 680;
const DOCKED_PAD = 80;
const MARGIN_BREAKPOINT = 1141;
const MARGIN_WITH_GAP = 268 + 56;

export function railWidthLimit(viewport: number): number {
  const margin = viewport >= MARGIN_BREAKPOINT ? MARGIN_WITH_GAP : 0;
  const room = viewport - DOCKED_PAD - READING_MEASURE - margin;
  return Math.max(RAIL_WIDTH_MIN, Math.min(RAIL_WIDTH_MAX, room));
}

/** Width to apply while the rail is docked. The stored preference is kept separately. */
export function dockedRailWidth(preferred: number, viewport: number): number {
  const limit = railWidthLimit(viewport);
  const wanted = Number.isFinite(preferred) ? preferred : RAIL_WIDTH_DEFAULT;
  return Math.round(Math.min(limit, Math.max(RAIL_WIDTH_MIN, wanted)));
}
