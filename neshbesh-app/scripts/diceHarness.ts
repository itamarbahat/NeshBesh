/**
 * Dice in-board invariant harness (PRD §4 US-006).
 *
 * Drives the same `simulateDiceFlight` the runtime uses and asserts that no
 * frame of any roll ever places a die's center outside the play-area rect.
 *
 * Usage: `npm run dice:check`
 *
 * The harness is deterministic: a seeded PRNG (mulberry32) varies the
 * initial throw direction / velocity so wall hits on all four edges are
 * exercised across the run. A failure prints the first OOB frame and
 * exits non-zero so CI can gate on it.
 */

import {
  simulateDiceFlight,
  ROLL_HARD_CAP_MS,
  type DicePose,
} from '../src/animations/diceConstants';

interface Failure {
  rollIdx: number;
  frameIdx: number;
  die: 0 | 1;
  x: number;
  y: number;
  walls: { left: number; right: number; top: number; bottom: number };
}

interface HarnessResult {
  ok: boolean;
  rolls: number;
  framesChecked: number;
  failures: Failure[];
}

// ── Deterministic PRNG (mulberry32) ─────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Realistic phone-class play area + die size ─────────────────────────────
const FRAME_W = 360;
const FRAME_H = 480;
const FRAME_BORDER = 8;
const DIE_SIZE = 40;
const WALLS = {
  left: FRAME_BORDER,
  right: FRAME_W - FRAME_BORDER,
  top: FRAME_BORDER,
  bottom: FRAME_H - FRAME_BORDER,
} as const;

function isCenterInBounds(p: DicePose): boolean {
  return p.x >= WALLS.left && p.x <= WALLS.right
      && p.y >= WALLS.top  && p.y <= WALLS.bottom;
}

export function simulateNRolls(n: number, seed: number): HarnessResult {
  const rng = mulberry32(seed);
  const failures: Failure[] = [];
  let framesChecked = 0;

  for (let rollIdx = 0; rollIdx < n; rollIdx++) {
    // Vary initial direction so all four walls are exercised. We pick one
    // of the four edges as the launch edge per roll.
    const edge = rollIdx % 4; // 0=top, 1=bottom, 2=left, 3=right
    const baseSpeed = 0.7 + rng() * 0.4; // px/ms — matches runtime range

    const cx = FRAME_W / 2;
    const cy = FRAME_H / 2;
    const half = DIE_SIZE / 2;

    let startA = { x: cx - DIE_SIZE * 0.6, y: cy, vx: 0, vy: 0, theta: 0, omega: (rng() - 0.5) * 0.05 };
    let startB = { x: cx + DIE_SIZE * 0.6, y: cy, vx: 0, vy: 0, theta: 0, omega: (rng() - 0.5) * 0.05 };

    if (edge === 0) {
      startA.y = WALLS.top + half; startB.y = WALLS.top + half;
      startA.vy = baseSpeed; startB.vy = baseSpeed * (0.85 + rng() * 0.3);
      startA.vx = (rng() - 0.5) * baseSpeed * 0.6;
      startB.vx = (rng() - 0.5) * baseSpeed * 0.6;
    } else if (edge === 1) {
      startA.y = WALLS.bottom - half; startB.y = WALLS.bottom - half;
      startA.vy = -baseSpeed; startB.vy = -baseSpeed * (0.85 + rng() * 0.3);
      startA.vx = (rng() - 0.5) * baseSpeed * 0.6;
      startB.vx = (rng() - 0.5) * baseSpeed * 0.6;
    } else if (edge === 2) {
      startA.x = WALLS.left + half; startB.x = WALLS.left + half + DIE_SIZE;
      startA.vx = baseSpeed; startB.vx = baseSpeed * (0.85 + rng() * 0.3);
      startA.vy = (rng() - 0.5) * baseSpeed * 0.6;
      startB.vy = (rng() - 0.5) * baseSpeed * 0.6;
    } else {
      startA.x = WALLS.right - half; startB.x = WALLS.right - half - DIE_SIZE;
      startA.vx = -baseSpeed; startB.vx = -baseSpeed * (0.85 + rng() * 0.3);
      startA.vy = (rng() - 0.5) * baseSpeed * 0.6;
      startB.vy = (rng() - 0.5) * baseSpeed * 0.6;
    }

    const sim = simulateDiceFlight({
      walls: WALLS,
      forbiddenRects: [],
      dieSize: DIE_SIZE,
      startA,
      startB,
      hardCapMs: ROLL_HARD_CAP_MS,
    });

    for (let f = 0; f < sim.framesA.length; f++) {
      framesChecked += 2;
      if (!isCenterInBounds(sim.framesA[f])) {
        failures.push({ rollIdx, frameIdx: f, die: 0, x: sim.framesA[f].x, y: sim.framesA[f].y, walls: { ...WALLS } });
      }
      if (!isCenterInBounds(sim.framesB[f])) {
        failures.push({ rollIdx, frameIdx: f, die: 1, x: sim.framesB[f].x, y: sim.framesB[f].y, walls: { ...WALLS } });
      }
    }
  }

  return { ok: failures.length === 0, rolls: n, framesChecked, failures };
}

// ── CLI entry ──────────────────────────────────────────────────────────────
const N = Number(process.env.DICE_HARNESS_N ?? 100);
const SEED = Number(process.env.DICE_HARNESS_SEED ?? 0xC0FFEE);
const result = simulateNRolls(N, SEED);

console.log(`🎲 Dice in-board harness — ${N} rolls, seed ${SEED}`);
console.log(`   frames checked: ${result.framesChecked}`);
console.log(`   failures:       ${result.failures.length}`);

if (!result.ok) {
  const head = result.failures.slice(0, 5);
  for (const f of head) {
    console.error(
      `   ❌ roll ${f.rollIdx}, frame ${f.frameIdx}, die ${f.die}: ` +
      `(${f.x.toFixed(2)}, ${f.y.toFixed(2)}) outside ` +
      `[${f.walls.left}..${f.walls.right}] × [${f.walls.top}..${f.walls.bottom}]`,
    );
  }
  if (result.failures.length > head.length) {
    console.error(`   … and ${result.failures.length - head.length} more`);
  }
  process.exit(1);
}

console.log('   ✅ all dice centers stayed inside the play-area rect.');
