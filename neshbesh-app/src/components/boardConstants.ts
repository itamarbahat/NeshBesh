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
