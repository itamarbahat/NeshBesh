import { PlayerSign, VictoryInfo } from '../types';

// Sentinel indices for bear-off destinations (outside the 0-25 board array)
export const BEAR_OFF_WHITE = 26; // White bears off past point 24
export const BEAR_OFF_BLACK = -1; // Black bears off past point 1

export const generateInitialBoard = (): number[] => {
  const b = new Array(26).fill(0);
  // White (positive, sign=1): moves 1 → 24. Bar at index 0.
  b[1] = 2; b[12] = 5; b[17] = 3; b[19] = 5;
  // Black (negative, sign=-1): moves 24 → 1. Bar at index 25.
  b[6] = -5; b[8] = -3; b[13] = -5; b[24] = -2;
  return b;
};

export const rollDie = (): number => Math.floor(Math.random() * 6) + 1;
export const rollTwoDice = (): [number, number] => [rollDie(), rollDie()];

export const hasBarPieces = (board: number[], sign: PlayerSign): boolean =>
  Math.abs(board[sign === 1 ? 0 : 25]) > 0;

export const canBearOff = (board: number[], sign: PlayerSign): boolean => {
  if (hasBarPieces(board, sign)) return false;
  const homeStart = sign === 1 ? 19 : 1;
  const homeEnd = sign === 1 ? 24 : 6;
  for (let i = 1; i <= 24; i++) {
    if (Math.sign(board[i]) === sign && (i < homeStart || i > homeEnd)) return false;
  }
  return true;
};

const isLandable = (board: number[], idx: number, sign: PlayerSign): boolean => {
  const c = board[idx];
  return Math.sign(c) !== -sign || Math.abs(c) <= 1;
};

// Returns { intermediate, final } highlight sets for the 2-click move system.
// intermediate = blue (mid-step of a multi-step path)
// final = green (valid stopping point)
export const calculatePossibleMoves = (
  board: number[],
  from: number,
  sign: PlayerSign,
  dice: number[],
  backward = false,
  bearOff = false,
): { intermediate: number[]; final: number[] } => {
  const inter = new Set<number>();
  const fin = new Set<number>();

  if (dice.length === 0) return { intermediate: [], final: [] };

  const baseDir = sign === 1 ? 1 : -1;
  const dir = backward ? -baseDir : baseDir;

  // Checks whether `idx` can be a final landing spot.
  const isValidFinal = (idx: number): boolean => {
    const offBoard = sign === 1 ? idx > 24 : idx < 1;
    if (offBoard) return bearOff;
    if (idx >= 1 && idx <= 24) return isLandable(board, idx, sign);
    return false;
  };

  // Checks whether `idx` is a valid intermediate step (must be on-board and landable).
  const isValidInter = (idx: number): boolean =>
    idx >= 1 && idx <= 24 && isLandable(board, idx, sign);

  // Map an out-of-bounds index to its sentinel value.
  const sentinel = (idx: number): number => {
    if (sign === 1 && idx > 24) return BEAR_OFF_WHITE;
    if (sign === -1 && idx < 1) return BEAR_OFF_BLACK;
    return idx;
  };

  // --- Bar re-entry (special case) ---
  if (from === 0 && sign === 1) {
    // White re-enters at points 1-6 (die value = target point)
    new Set(dice).forEach(d => {
      if (d >= 1 && d <= 6 && isValidFinal(d)) fin.add(d);
    });
    return { intermediate: [], final: [...fin] };
  }
  if (from === 25 && sign === -1) {
    // Black re-enters at points 19-24 (target = 25 - die)
    new Set(dice).forEach(d => {
      const t = 25 - d;
      if (t >= 19 && t <= 24 && isValidFinal(t)) fin.add(t);
    });
    return { intermediate: [], final: [...fin] };
  }

  // --- Single die ---
  if (dice.length === 1) {
    const t = from + dir * dice[0];
    if (isValidFinal(t)) fin.add(sentinel(t));
    return { intermediate: [], final: [...fin] };
  }

  // --- Two distinct (or same) dice ---
  if (dice.length === 2) {
    const [d1, d2] = dice;
    // Path A: d1 first, then d2
    const t1 = from + dir * d1;
    if (isValidFinal(t1)) fin.add(sentinel(t1));
    if (isValidInter(t1)) {
      inter.add(t1);
      const f1 = t1 + dir * d2;
      if (isValidFinal(f1)) fin.add(sentinel(f1));
    }
    // Path B: d2 first, then d1 (only meaningful if d1 ≠ d2)
    if (d1 !== d2) {
      const t2 = from + dir * d2;
      if (isValidFinal(t2)) fin.add(sentinel(t2));
      if (isValidInter(t2)) {
        inter.add(t2);
        const f2 = t2 + dir * d1;
        if (isValidFinal(f2)) fin.add(sentinel(f2));
      }
    }
    return { intermediate: [...inter], final: [...fin] };
  }

  // --- Doubles (3 or 4 identical dice) ---
  const d = dice[0];
  let cur = from;
  for (let i = 0; i < dice.length; i++) {
    cur += dir * d;
    const last = i === dice.length - 1;
    if (!isValidFinal(cur)) break;
    fin.add(sentinel(cur));
    if (!last) inter.add(cur);
  }

  return { intermediate: [...inter].filter(x => x >= 1 && x <= 24), final: [...fin] };
};

// Determine which dice were consumed by a move from `from` to `to`.
// Returns the remaining dice array.
export const getDiceAfterMove = (
  dice: number[],
  from: number,
  to: number,
  sign: PlayerSign,
  backward = false,
): number[] => {
  const dir = (sign === 1 ? 1 : -1) * (backward ? -1 : 1);

  // Bear-off: consume minimum exact die, or smallest die >= needed
  if (to === BEAR_OFF_WHITE || to === BEAR_OFF_BLACK) {
    const needed = sign === 1 ? 25 - from : from;
    const exact = dice.findIndex(d => d === needed);
    if (exact !== -1) {
      const r = [...dice]; r.splice(exact, 1); return r;
    }
    const eligible = dice
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d >= needed)
      .sort((a, b) => a.d - b.d);
    if (eligible.length) {
      const r = [...dice]; r.splice(eligible[0].i, 1); return r;
    }
    return dice;
  }

  const steps = (to - from) * dir;
  const allSame = dice.every(d => d === dice[0]);

  // Doubles: how many dice used = steps / die
  if (allSame && dice.length > 1) {
    const used = Math.round(steps / dice[0]);
    if (used >= 1 && used <= dice.length) return dice.slice(used);
  }

  // Single die match
  const si = dice.findIndex(d => d === steps);
  if (si !== -1) { const r = [...dice]; r.splice(si, 1); return r; }

  // Two dice sum
  for (let i = 0; i < dice.length - 1; i++) {
    for (let j = i + 1; j < dice.length; j++) {
      if (dice[i] + dice[j] === steps) {
        const r = [...dice]; r.splice(j, 1); r.splice(i, 1); return r;
      }
    }
  }

  return dice;
};

// Apply a move on the board; returns new board + flags.
export const applyMove = (
  board: number[],
  from: number,
  to: number,
  sign: PlayerSign,
): { board: number[]; captured: boolean; borneOff: boolean } => {
  const nb = [...board];
  const opp = -sign as PlayerSign;
  let captured = false;

  // Remove piece from source
  nb[from] -= sign;

  // Bear-off: piece leaves the board
  if (to === BEAR_OFF_WHITE || to === BEAR_OFF_BLACK) {
    return { board: nb, captured: false, borneOff: true };
  }

  // Capture opponent blot (exactly 1 enemy piece = a "blot")
  if (Math.sign(nb[to]) === opp && Math.abs(nb[to]) === 1) {
    const barIdx = opp === 1 ? 0 : 25;
    nb[to] = 0;
    nb[barIdx] += opp; // e.g. opp=1 → nb[0]++ (White bar); opp=-1 → nb[25]-- (Black bar)
    captured = true;
  }

  // Place piece
  nb[to] += sign;
  return { board: nb, captured, borneOff: false };
};

// Apply the 6:5 Nesh Strike: send all opponent blots to the bar.
export const applyNeshStrike = (
  board: number[],
  currentSign: PlayerSign,
): { board: number[]; blotsCaptured: number } => {
  const nb = [...board];
  const opp = -currentSign as PlayerSign;
  const barIdx = opp === 1 ? 0 : 25;
  let blotsCaptured = 0;
  for (let i = 1; i <= 24; i++) {
    if (nb[i] === opp) { // Exactly one opponent piece = blot
      nb[i] = 0;
      nb[barIdx] += opp;
      blotsCaptured++;
    }
  }
  return { board: nb, blotsCaptured };
};

// All valid free-move destinations for the Nesh Strike (non-blocked points).
export const getFreeMoveFinals = (board: number[], sign: PlayerSign): number[] => {
  const valid: number[] = [];
  for (let i = 1; i <= 24; i++) {
    if (isLandable(board, i, sign)) valid.push(i);
  }
  return valid;
};

export const calculateVictory = (
  board: number[],
  winnerSign: PlayerSign,
  loserBorneOff: number,
): VictoryInfo => {
  if (loserBorneOff > 0) return { type: 'Simple', points: 1 };

  const opp = -winnerSign as PlayerSign;
  const barIdx = opp === 1 ? 0 : 25;
  if (Math.abs(board[barIdx]) > 0) return { type: 'Star Mars', points: Infinity };

  const homeStart = winnerSign === 1 ? 19 : 1;
  const homeEnd = winnerSign === 1 ? 24 : 6;
  for (let i = homeStart; i <= homeEnd; i++) {
    if (Math.sign(board[i]) === opp) return { type: 'Turkish Mars', points: 3 };
  }

  return { type: 'Mars', points: 2 };
};
