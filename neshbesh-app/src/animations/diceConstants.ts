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
// Capped at 3000 (US-009): physics tuning targets the 99th percentile
// settle time at or below this value; the trajectory simulator hard-snaps
// to the final pose if any die is still moving when this cap elapses.
export const ROLL_DURATION_MIN_MS: number = 1000;
export const ROLL_DURATION_MAX_MS: number = 3000;
export const ROLL_HARD_CAP_MS: number = 3000;

// ── Physics tuning ──────────────────────────────────────────────────────────
// Restitution = elastic energy retained on a bounce (1 = perfect bounce,
// 0 = stick). 0.55 lets the dice bounce a few times before settling.
// Friction (per-frame) damps velocity; chosen so a typical launch decays to
// rest within ~2.5s on average.
export const PHYSICS_RESTITUTION: number = 0.55;
export const PHYSICS_FRICTION_PER_FRAME: number = 0.965;
export const PHYSICS_ANGULAR_FRICTION_PER_FRAME: number = 0.955;
export const PHYSICS_REST_VELOCITY: number = 0.015;     // px/ms
export const PHYSICS_REST_ANGULAR: number = 0.0008;     // rad/ms
export const PHYSICS_FRAME_DT_MS: number = 16;          // ~60 fps

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

// ═════════════════════════════════════════════════════════════════════════════
// DICE FLIGHT SIMULATOR (US-007 elastic walls · US-008 dice-on-dice collision
// · US-009 3-second settle cap · US-010 forbidden-rect occlusion guard)
// ═════════════════════════════════════════════════════════════════════════════

export interface DicePose {
  x: number;
  y: number;
  theta: number; // radians
}

export interface FlightResult {
  framesA: DicePose[];
  framesB: DicePose[];
  /** Duration the simulation actually ran (≤ ROLL_HARD_CAP_MS). The renderer
   *  may stretch or compress the visual playback to match the requested
   *  on-screen duration but settle behaviour is fully determined by this. */
  simDurationMs: number;
  /** Final at-rest pose for each die (last frame of each array). */
  finalA: DicePose;
  finalB: DicePose;
  /** Frame indices at which the two dice collided (US-012). The renderer
   *  uses these to schedule one-shot collision SFX during playback. */
  collisionFrames: number[];
  /** Frame indices at which either die landed/bounced off a wall or a
   *  forbidden rect — used by US-014 to stagger per-die land cues. */
  bounceFramesA: number[];
  bounceFramesB: number[];
  /** Frame index at which each die first comes to rest (or
   *  `framesA.length - 1` if it never converged within the cap). */
  restFrameA: number;
  restFrameB: number;
}

interface RigidBody {
  x: number; y: number;
  vx: number; vy: number;
  theta: number; omega: number;
}

interface Walls { left: number; right: number; top: number; bottom: number; }

function clampToWalls(b: RigidBody, dieSize: number, walls: Walls): boolean {
  const half = dieSize / 2;
  let bounced = false;
  if (b.x - half < walls.left)  { b.x = walls.left + half;  b.vx = -b.vx * PHYSICS_RESTITUTION; bounced = true; }
  if (b.x + half > walls.right) { b.x = walls.right - half; b.vx = -b.vx * PHYSICS_RESTITUTION; bounced = true; }
  if (b.y - half < walls.top)   { b.y = walls.top + half;   b.vy = -b.vy * PHYSICS_RESTITUTION; bounced = true; }
  if (b.y + half > walls.bottom){ b.y = walls.bottom - half;b.vy = -b.vy * PHYSICS_RESTITUTION; bounced = true; }
  return bounced;
}

// Treat each forbidden rect as a solid obstacle: if a die's AABB enters one,
// push the die back along the shallowest axis and reflect that velocity
// component. This handles BOTH checker stacks (US-007 by extension) AND the
// pip-indicator region (US-010).
function clampToForbiddenRects(b: RigidBody, dieSize: number, rects: Rect[]): void {
  const half = dieSize / 2;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const dieLeft = b.x - half, dieRight = b.x + half;
    const dieTop  = b.y - half, dieBot   = b.y + half;
    const rLeft = r.x, rRight = r.x + r.w, rTop = r.y, rBot = r.y + r.h;
    if (dieRight <= rLeft || dieLeft >= rRight) continue;
    if (dieBot <= rTop || dieTop >= rBot) continue;
    // Overlap exists — find shallowest axis to push out.
    const overlapL = dieRight - rLeft;
    const overlapR = rRight - dieLeft;
    const overlapT = dieBot - rTop;
    const overlapB = rBot - dieTop;
    const minOv = Math.min(overlapL, overlapR, overlapT, overlapB);
    if (minOv === overlapL)      { b.x -= overlapL; b.vx = -Math.abs(b.vx) * PHYSICS_RESTITUTION; }
    else if (minOv === overlapR) { b.x += overlapR; b.vx =  Math.abs(b.vx) * PHYSICS_RESTITUTION; }
    else if (minOv === overlapT) { b.y -= overlapT; b.vy = -Math.abs(b.vy) * PHYSICS_RESTITUTION; }
    else                         { b.y += overlapB; b.vy =  Math.abs(b.vy) * PHYSICS_RESTITUTION; }
  }
}

// Circle-circle elastic collision using circumscribed-circle approximation
// (radius = dieSize / sqrt(2)). Equal masses → exchange of velocity along
// the contact normal.
function resolveDieDie(a: RigidBody, b: RigidBody, dieSize: number): boolean {
  const radius = (dieSize / Math.SQRT2);
  const minDist = radius * 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist >= minDist) return false;
  const overlap = minDist - dist;
  const nx = dx / dist;
  const ny = dy / dist;
  // Position correction
  a.x -= (nx * overlap) / 2;
  a.y -= (ny * overlap) / 2;
  b.x += (nx * overlap) / 2;
  b.y += (ny * overlap) / 2;
  // Velocity exchange along normal (equal mass)
  const v1n = a.vx * nx + a.vy * ny;
  const v2n = b.vx * nx + b.vy * ny;
  const dvn = (v2n - v1n) * PHYSICS_RESTITUTION;
  a.vx += dvn * nx;
  a.vy += dvn * ny;
  b.vx -= dvn * nx;
  b.vy -= dvn * ny;
  // Imparted spin from collision
  a.omega += (b.omega - a.omega) * 0.3;
  b.omega += (a.omega - b.omega) * 0.3;
  return true;
}

function isAtRest(b: RigidBody): boolean {
  return Math.abs(b.vx) < PHYSICS_REST_VELOCITY
      && Math.abs(b.vy) < PHYSICS_REST_VELOCITY
      && Math.abs(b.omega) < PHYSICS_REST_ANGULAR;
}

/**
 * Simulate a paired-dice flight inside a rectangular play area with elastic
 * walls, dice-on-dice collisions, and forbidden-rect avoidance. Returns
 * sampled poses every PHYSICS_FRAME_DT_MS up to ROLL_HARD_CAP_MS; if both
 * dice settle earlier, the remaining frames repeat the rest pose so the
 * caller can drive a fixed-length animation without branching.
 */
export function simulateDiceFlight(opts: {
  walls: Walls;
  forbiddenRects: Rect[];
  dieSize: number;
  startA: { x: number; y: number; vx: number; vy: number; theta: number; omega: number };
  startB: { x: number; y: number; vx: number; vy: number; theta: number; omega: number };
  hardCapMs?: number;
}): FlightResult {
  const cap = opts.hardCapMs ?? ROLL_HARD_CAP_MS;
  const dt = PHYSICS_FRAME_DT_MS;
  const totalFrames = Math.ceil(cap / dt) + 1;
  const a: RigidBody = { ...opts.startA };
  const b: RigidBody = { ...opts.startB };
  const framesA: DicePose[] = new Array(totalFrames);
  const framesB: DicePose[] = new Array(totalFrames);
  const collisionFrames: number[] = [];
  const bounceFramesA: number[] = [];
  const bounceFramesB: number[] = [];
  let settledFrame = -1;
  let restFrameA = -1;
  let restFrameB = -1;
  // Throttle collision events so a contact lasting several frames does not
  // produce a stream of ticks (US-012 acceptance: one event per discrete
  // contact). 6 frames ≈ 96ms which matches the audio rate-limiter.
  let collisionCooldown = 0;

  for (let i = 0; i < totalFrames; i++) {
    framesA[i] = { x: a.x, y: a.y, theta: a.theta };
    framesB[i] = { x: b.x, y: b.y, theta: b.theta };

    if (settledFrame >= 0) continue; // freeze remaining frames at rest pose

    // Integrate
    a.x += a.vx * dt; a.y += a.vy * dt; a.theta += a.omega * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.theta += b.omega * dt;

    // Constraints
    if (clampToWalls(a, opts.dieSize, opts.walls)) bounceFramesA.push(i);
    if (clampToWalls(b, opts.dieSize, opts.walls)) bounceFramesB.push(i);
    clampToForbiddenRects(a, opts.dieSize, opts.forbiddenRects);
    clampToForbiddenRects(b, opts.dieSize, opts.forbiddenRects);
    if (collisionCooldown > 0) collisionCooldown--;
    if (resolveDieDie(a, b, opts.dieSize)) {
      if (collisionCooldown === 0) {
        collisionFrames.push(i);
        collisionCooldown = 6;
      }
    }

    // Friction
    a.vx *= PHYSICS_FRICTION_PER_FRAME; a.vy *= PHYSICS_FRICTION_PER_FRAME;
    b.vx *= PHYSICS_FRICTION_PER_FRAME; b.vy *= PHYSICS_FRICTION_PER_FRAME;
    a.omega *= PHYSICS_ANGULAR_FRICTION_PER_FRAME;
    b.omega *= PHYSICS_ANGULAR_FRICTION_PER_FRAME;

    // Per-die rest detection feeds the staggered land trigger (US-014).
    if (restFrameA < 0 && isAtRest(a)) {
      a.vx = a.vy = a.omega = 0;
      restFrameA = i;
    }
    if (restFrameB < 0 && isAtRest(b)) {
      b.vx = b.vy = b.omega = 0;
      restFrameB = i;
    }
    if (restFrameA >= 0 && restFrameB >= 0) {
      settledFrame = i;
    }
  }

  // The last entries of framesA/framesB are the settled poses (or final
  // hard-snap pose if motion never converged within the cap).
  const finalA = framesA[totalFrames - 1];
  const finalB = framesB[totalFrames - 1];
  return {
    framesA,
    framesB,
    simDurationMs: settledFrame >= 0 ? settledFrame * dt : cap,
    finalA,
    finalB,
    collisionFrames,
    bounceFramesA,
    bounceFramesB,
    restFrameA: restFrameA >= 0 ? restFrameA : totalFrames - 1,
    restFrameB: restFrameB >= 0 ? restFrameB : totalFrames - 1,
  };
}
