// ═════════════════════════════════════════════════════════════════════════════
// DICE PHYSICS CONSTANTS — single source of truth for sizes, timings, and
// landing-zone math used by ThrowingDiceOverlay, DicePanel, and the audio
// shake/land/click pipeline. Tune here, never inline.
// ═════════════════════════════════════════════════════════════════════════════

import type { Rect } from '../components/boardConstants';

// Tray dice are rendered visibly bigger than the on-board landed dice. The
// landing pop briefly scales the die up on impact before settling.
export const TRAY_DIE_SCALE: number = 1.6;
export const BOARD_DIE_SCALE: number = 1.0;
export const LANDING_POP_SCALE: number = 1.25;
export const LANDING_POP_MS: number = 180;

// Roll duration is randomized per throw so the dice never feel mechanical.
// Both the flight animation and the shake SFX read the same value.
export const ROLL_DURATION_MIN_MS: number = 1000;
export const ROLL_DURATION_MAX_MS: number = 4000;

/**
 * Returns a uniformly random integer roll duration in
 * [ROLL_DURATION_MIN_MS, ROLL_DURATION_MAX_MS]. Pure: shares no state, so
 * each call is independent — `ThrowingDiceOverlay` is the single caller per
 * roll and threads the value to consumers (audio, animation).
 */
export function getRollDurationMs(): number {
  const span = ROLL_DURATION_MAX_MS - ROLL_DURATION_MIN_MS;
  return ROLL_DURATION_MIN_MS + Math.floor(Math.random() * (span + 1));
}

// ── Rejection-sampled landing point ─────────────────────────────────────────
// Picks a random `{x, y}` inside the board such that a die of size `dieSize`
// centred at that point does not intersect any occupied checker rect. Falls
// back to the central horizontal bar zone if no valid point is found.

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x ||
           a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function dieRect(cx: number, cy: number, dieSize: number): Rect {
  return { x: cx - dieSize / 2, y: cy - dieSize / 2, w: dieSize, h: dieSize };
}

export interface LandingPoint { x: number; y: number; }

export function pickLandingPoint(
  boardW: number,
  boardH: number,
  dieSize: number,
  occupied: Rect[],
  maxAttempts: number = 30,
): LandingPoint {
  const margin = dieSize * 0.6;
  const minX = margin;
  const maxX = Math.max(margin + 1, boardW - margin);
  const minY = margin;
  const maxY = Math.max(margin + 1, boardH - margin);

  for (let i = 0; i < maxAttempts; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    const r = dieRect(x, y, dieSize);
    let hit = false;
    for (let j = 0; j < occupied.length; j++) {
      if (rectsOverlap(r, occupied[j])) { hit = true; break; }
    }
    if (!hit) return { x, y };
  }

  // Fallback: central horizontal bar zone — y in the middle band, x across
  // the central 60% of the board. Always returns.
  const cx = boardW * 0.2 + Math.random() * boardW * 0.6;
  const cy = boardH * 0.45 + Math.random() * boardH * 0.10;
  return { x: cx, y: cy };
}

/**
 * Returns two landing points for a pair of dice. The second point is
 * resampled until it sits at least `dieSize * 1.1` from the first (centre
 * to centre). Falls back to a horizontal offset if it cannot separate them.
 */
export function pickPairLandingPoints(
  boardW: number,
  boardH: number,
  dieSize: number,
  occupied: Rect[],
  maxAttempts: number = 30,
): [LandingPoint, LandingPoint] {
  const minSep = dieSize * 1.1;
  const a = pickLandingPoint(boardW, boardH, dieSize, occupied, maxAttempts);
  for (let i = 0; i < maxAttempts; i++) {
    const b = pickLandingPoint(boardW, boardH, dieSize, occupied, maxAttempts);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) >= minSep) return [a, b];
  }
  // Could not find a separated pair — push the second die sideways.
  const offsetDir = a.x < boardW / 2 ? 1 : -1;
  const fallback: LandingPoint = {
    x: Math.max(dieSize / 2, Math.min(boardW - dieSize / 2, a.x + offsetDir * minSep)),
    y: a.y,
  };
  return [a, fallback];
}
