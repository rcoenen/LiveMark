/** Docked documents rail. The reading measure stays 680px, so the rail cannot grow into it. */
export const RAIL_WIDTH_DEFAULT = 232;
export const RAIL_WIDTH_MIN = 180;
export const RAIL_WIDTH_MAX = 420;
const READING_MEASURE = 680;
/** Workspace padding (2 × 24) plus the page's own padding (2 × 40). */
const DOCKED_PAD = 128;
const DETAILS_BREAKPOINT = 1141;
export const DETAILS_WIDTH = 288;

/** `detailsWidth` is the width the right panel takes; by default the full panel whenever the window is wide enough. */
export function railWidthLimit(viewport: number, detailsWidth?: number): number {
  const details = detailsWidth ?? (viewport >= DETAILS_BREAKPOINT ? DETAILS_WIDTH : 0);
  const room = viewport - DOCKED_PAD - READING_MEASURE - details;
  return Math.max(RAIL_WIDTH_MIN, Math.min(RAIL_WIDTH_MAX, room));
}

/** Width to apply while the rail is docked. The stored preference is kept separately. */
export function dockedRailWidth(preferred: number, viewport: number, detailsWidth?: number): number {
  const limit = railWidthLimit(viewport, detailsWidth);
  const wanted = Number.isFinite(preferred) ? preferred : RAIL_WIDTH_DEFAULT;
  return Math.round(Math.min(limit, Math.max(RAIL_WIDTH_MIN, wanted)));
}
