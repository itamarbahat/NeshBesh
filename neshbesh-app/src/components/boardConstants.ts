// ═════════════════════════════════════════════════════════════════════════════
// FROZEN AESTHETICS — honey-tan palette + proportions from the reference photo.
// These values are the source of truth for board visuals. Do not tune in place:
// if the design ever needs to change, update this block and nowhere else.
// ═════════════════════════════════════════════════════════════════════════════
export const BOARD_FROZEN = {
  // Aspect ratio: open board ≈ 1.52:1 (wider than tall), matches reference photo.
  ASPECT: 1.52,

  // Checker size as a fraction of slot width. 0.66 keeps stacks of 5+ within
  // the cone without visual overflow.
  PIECE_SLOT_RATIO: 0.66,

  // Center bar width as a fraction of inner board width.
  BAR_WIDTH_RATIO: 0.055,

  // Wood palette
  WOOD_SURFACE:  '#C68B44',  // honey-tan base
  WOOD_FRAME:    '#A0632A',  // lighter frame around inside
  WOOD_BAR:      '#8B5A28',  // center bar strip — same tone as frame
  WOOD_OVERLAY:  'rgba(70,35,10,0.06)', // subtle vignette

  // Cone (point) palette
  CONE_DARK:  '#1A1612',
  CONE_LIGHT: '#D2B48C',

  // Bear-off tray
  TRAY_BG:     '#4A2A10',
  TRAY_BORDER: '#8B5A28',
} as const;

// Back-compat alias — some components still read BOARD_ASPECT directly.
export const BOARD_ASPECT = BOARD_FROZEN.ASPECT;

// ── Occupancy geometry ──────────────────────────────────────────────────────
// Used by the dice landing code to avoid placing a die on top of any
// occupied checker stack. Coordinates are board-local: origin (0,0) at the
// top-left of the border-framed playing surface, axes growing right/down.

export interface Rect { x: number; y: number; w: number; h: number; }

const FRAME_BORDER = 8;
const STACK_CAP_FOR_OCCUPANCY = 5;
const TOP_ROW_INDICES = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const BOT_ROW_INDICES = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export function getOccupancyRects(
  board: number[],
  boardWidth: number,
  boardHeight: number,
): Rect[] {
  const rects: Rect[] = [];
  const innerW = boardWidth - FRAME_BORDER * 2;
  const innerH = boardHeight - FRAME_BORDER * 2;
  if (innerW <= 0 || innerH <= 0) return rects;

  const barW = innerW * BOARD_FROZEN.BAR_WIDTH_RATIO;
  const slotW = (innerW - barW) / 12;
  const pieceSize = slotW * BOARD_FROZEN.PIECE_SLOT_RATIO;
  const halfH = innerH / 2;

  const slotXForCol = (col: number): number => {
    const halfCol = col % 6;
    const isRight = col >= 6;
    const halfX = FRAME_BORDER + (isRight ? slotW * 6 + barW : 0);
    return halfX + halfCol * slotW;
  };

  TOP_ROW_INDICES.forEach((idx, col) => {
    const count = Math.abs(board[idx] ?? 0);
    if (count < 1) return;
    const stackH = Math.min(count, STACK_CAP_FOR_OCCUPANCY) * pieceSize;
    const cx = slotXForCol(col) + slotW / 2;
    rects.push({
      x: cx - pieceSize / 2,
      y: FRAME_BORDER,
      w: pieceSize,
      h: stackH,
    });
  });

  BOT_ROW_INDICES.forEach((idx, col) => {
    const count = Math.abs(board[idx] ?? 0);
    if (count < 1) return;
    const stackH = Math.min(count, STACK_CAP_FOR_OCCUPANCY) * pieceSize;
    const cx = slotXForCol(col) + slotW / 2;
    rects.push({
      x: cx - pieceSize / 2,
      y: FRAME_BORDER + innerH - stackH,
      w: pieceSize,
      h: stackH,
    });
  });

  const barCenterX = FRAME_BORDER + slotW * 6 + barW / 2;
  const barLeft = barCenterX - pieceSize / 2;

  const bar25 = Math.abs(board[25] ?? 0);
  if (bar25 >= 1) {
    const stackH = Math.min(bar25, STACK_CAP_FOR_OCCUPANCY) * pieceSize;
    rects.push({
      x: barLeft,
      y: FRAME_BORDER + halfH / 2 - stackH / 2,
      w: pieceSize,
      h: stackH,
    });
  }
  const bar0 = Math.abs(board[0] ?? 0);
  if (bar0 >= 1) {
    const stackH = Math.min(bar0, STACK_CAP_FOR_OCCUPANCY) * pieceSize;
    rects.push({
      x: barLeft,
      y: FRAME_BORDER + halfH + halfH / 2 - stackH / 2,
      w: pieceSize,
      h: stackH,
    });
  }

  return rects;
}
