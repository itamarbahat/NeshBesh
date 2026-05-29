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

// Standard backgammon bear-off rule: a die value X may bear off a checker at
// distance D iff X === D, OR X > D AND no checker is farther from the exit.
// `excludedSlot` is the moving piece's original slot (its piece is conceptually
// already in transit and must not block its own overshoot).
export const isLegalBearOff = (
  board: number[],
  sign: PlayerSign,
  fromSlot: number,
  dieValue: number,
  excludedSlot?: number,
): boolean => {
  const distance = sign === 1 ? 25 - fromSlot : fromSlot;
  if (dieValue === distance) return true;
  if (dieValue < distance) return false;
  if (sign === 1) {
    // White: farther from exit = lower index in home [19..fromSlot-1]
    for (let i = 19; i < fromSlot; i++) {
      if (i === excludedSlot) continue;
      if (board[i] > 0) return false;
    }
  } else {
    // Black: farther from exit = higher index in home [fromSlot+1..6]
    for (let i = fromSlot + 1; i <= 6; i++) {
      if (i === excludedSlot) continue;
      if (board[i] < 0) return false;
    }
  }
  return true;
};

// True iff the bar-entry target for this die is occupied by 2+ opponent
// checkers (cannot land). Used by the blocked-double-on-Bar re-roll flow.
export const isBarEntryBlocked = (
  board: number[],
  sign: PlayerSign,
  dieValue: number,
): boolean => {
  const target = sign === 1 ? dieValue : 25 - dieValue;
  if (target < 1 || target > 24) return true;
  return Math.sign(board[target]) === -sign && Math.abs(board[target]) >= 2;
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
  const cached = getCachedMoves(board, from, sign, dice, backward, bearOff);
  if (cached) return cached;

  const inter = new Set<number>();
  const fin = new Set<number>();

  if (dice.length === 0) return cacheMoves(board, from, sign, dice, backward, bearOff, { intermediate: [], final: [] });

  const baseDir = sign === 1 ? 1 : -1;
  const dir = backward ? -baseDir : baseDir;

  // Map an out-of-bounds index to its sentinel value.
  const sentinel = (idx: number): number => {
    if (sign === 1 && idx > 24) return BEAR_OFF_WHITE;
    if (sign === -1 && idx < 1) return BEAR_OFF_BLACK;
    return idx;
  };

  // Try to add `idx` as a final landing spot. `sourceSlot`/`dieValue` describe
  // the bear-off attempt so the standard "must advance from higher slots first"
  // rule (isLegalBearOff) can gate off-board landings.
  const addFinal = (idx: number, sourceSlot: number, dieValue: number): void => {
    const offBoard = sign === 1 ? idx > 24 : idx < 1;
    if (offBoard) {
      if (!bearOff) return;
      if (!isLegalBearOff(board, sign, sourceSlot, dieValue, from)) return;
      fin.add(sentinel(idx));
      return;
    }
    if (idx >= 1 && idx <= 24 && isLandable(board, idx, sign)) fin.add(idx);
  };

  const isValidInter = (idx: number): boolean =>
    idx >= 1 && idx <= 24 && isLandable(board, idx, sign);

  // --- Bar re-entry (special case) ---
  if (from === 0 && sign === 1) {
    // White re-enters at points 1-6 (die value = target point); bar entry is
    // never a bear-off so the higher-slot rule doesn't apply.
    new Set(dice).forEach(d => {
      if (d >= 1 && d <= 6 && isLandable(board, d, sign)) fin.add(d);
    });
    return cacheMoves(board, from, sign, dice, backward, bearOff, { intermediate: [], final: [...fin] });
  }
  if (from === 25 && sign === -1) {
    new Set(dice).forEach(d => {
      const t = 25 - d;
      if (t >= 19 && t <= 24 && isLandable(board, t, sign)) fin.add(t);
    });
    return cacheMoves(board, from, sign, dice, backward, bearOff, { intermediate: [], final: [...fin] });
  }

  // --- Single die ---
  if (dice.length === 1) {
    const t = from + dir * dice[0];
    addFinal(t, from, dice[0]);
    return cacheMoves(board, from, sign, dice, backward, bearOff, { intermediate: [], final: [...fin] });
  }

  // --- Two distinct (or same) dice ---
  if (dice.length === 2) {
    const [d1, d2] = dice;
    // Path A: d1 first, then d2
    const t1 = from + dir * d1;
    addFinal(t1, from, d1);
    if (isValidInter(t1)) {
      inter.add(t1);
      const f1 = t1 + dir * d2;
      addFinal(f1, t1, d2);
    }
    // Path B: d2 first, then d1 (only meaningful if d1 ≠ d2)
    if (d1 !== d2) {
      const t2 = from + dir * d2;
      addFinal(t2, from, d2);
      if (isValidInter(t2)) {
        inter.add(t2);
        const f2 = t2 + dir * d1;
        addFinal(f2, t2, d1);
      }
    }
    return cacheMoves(board, from, sign, dice, backward, bearOff, { intermediate: [...inter], final: [...fin] });
  }

  // --- Doubles (3 or 4 identical dice) ---
  const d = dice[0];
  let cur = from;
  let prev = from;
  for (let i = 0; i < dice.length; i++) {
    prev = cur;
    cur += dir * d;
    addFinal(cur, prev, d);
    const offBoard = sign === 1 ? cur > 24 : cur < 1;
    if (offBoard) break; // bear-off ends the path
    if (!isValidInter(cur)) break;
    if (i !== dice.length - 1) inter.add(cur);
  }

  return cacheMoves(board, from, sign, dice, backward, bearOff, {
    intermediate: [...inter].filter(x => x >= 1 && x <= 24),
    final: [...fin],
  });
};

// ── Move-search cache (US-015) ──────────────────────────────────────────────
// Path search is the Click-1 hot path. Within a single turn the (board, from,
// dice, backward, bearOff) tuple is hit repeatedly as React re-renders consume
// the same query. We cache by a fast string key and clear on every store
// mutation that could change legality (turn start + after each move).
type MoveResult = { intermediate: number[]; final: number[] };
let _moveCache: Map<string, MoveResult> | null = null;

const cacheKey = (
  board: number[],
  from: number,
  sign: PlayerSign,
  dice: number[],
  backward: boolean,
  bearOff: boolean,
): string => `${board.join(',')}|${from}|${sign}|${dice.join(',')}|${backward ? 1 : 0}|${bearOff ? 1 : 0}`;

const getCachedMoves = (
  board: number[],
  from: number,
  sign: PlayerSign,
  dice: number[],
  backward: boolean,
  bearOff: boolean,
): MoveResult | null => {
  if (!_moveCache) return null;
  return _moveCache.get(cacheKey(board, from, sign, dice, backward, bearOff)) ?? null;
};

const cacheMoves = (
  board: number[],
  from: number,
  sign: PlayerSign,
  dice: number[],
  backward: boolean,
  bearOff: boolean,
  result: MoveResult,
): MoveResult => {
  if (!_moveCache) _moveCache = new Map();
  _moveCache.set(cacheKey(board, from, sign, dice, backward, bearOff), result);
  return result;
};

export const resetMoveCache = (): void => {
  _moveCache = null;
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

  if (to === BEAR_OFF_WHITE || to === BEAR_OFF_BLACK) {
    const needed = sign === 1 ? 25 - from : from;

    // 1) Exact single-die match
    const exact = dice.findIndex(d => d === needed);
    if (exact !== -1) {
      const r = [...dice]; r.splice(exact, 1); return r;
    }

    // 2) Single-die overshoot (smallest die >= needed)
    const eligible = dice
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d >= needed)
      .sort((a, b) => a.d - b.d);
    if (eligible.length) {
      const r = [...dice]; r.splice(eligible[0].i, 1); return r;
    }

    // 3) Doubles: consume k = ceil(needed / d) dice when k <= dice.length
    if (dice.length > 1 && dice.every(d => d === dice[0])) {
      const d = dice[0];
      const k = Math.ceil(needed / d);
      if (k <= dice.length) return dice.slice(k);
    }

    // 4) Two-die sum (non-double): consume both if their sum >= needed
    if (dice.length >= 2) {
      for (let i = 0; i < dice.length - 1; i++) {
        for (let j = i + 1; j < dice.length; j++) {
          if (dice[i] + dice[j] >= needed) {
            const r = [...dice]; r.splice(j, 1); r.splice(i, 1); return r;
          }
        }
      }
    }

    // 5) Defensive: never silently grant a free bear-off. Consume the largest die.
    if (dice.length > 0) {
      let maxIdx = 0;
      for (let i = 1; i < dice.length; i++) if (dice[i] > dice[maxIdx]) maxIdx = i;
      const r = [...dice]; r.splice(maxIdx, 1); return r;
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
// When `opponentHomeOnly` is true (used for the 6:5 first free move while the
// player is on the Bar), restrict targets to the opponent's home — i.e. the
// player's bar-entry zone: White → slots 1..6, Black → slots 19..24.
export const getFreeMoveFinals = (
  board: number[],
  sign: PlayerSign,
  opponentHomeOnly = false,
  source: number | null = null,
): number[] => {
  const valid: number[] = [];
  const start = opponentHomeOnly ? (sign === 1 ? 1 : 19) : 1;
  const end = opponentHomeOnly ? (sign === 1 ? 6 : 24) : 24;
  for (let i = start; i <= end; i++) {
    if (i === source) continue;
    if (isLandable(board, i, sign)) valid.push(i);
  }
  return valid;
};

// Returns true if the current player has at least one legal move with the given dice.
// Bar re-entry is mandatory when there are bar pieces (only the bar is checked).
export const hasAnyMove = (
  board: number[],
  sign: PlayerSign,
  dice: number[],
  backward: boolean,
  bearOff: boolean,
): boolean => {
  if (dice.length === 0) return false;
  const barIdx = sign === 1 ? 0 : 25;
  if (Math.abs(board[barIdx]) > 0) {
    const { final } = calculatePossibleMoves(board, barIdx, sign, dice, backward, bearOff);
    return final.length > 0;
  }
  for (let i = 1; i <= 24; i++) {
    if (Math.sign(board[i]) === sign) {
      const { final } = calculatePossibleMoves(board, i, sign, dice, backward, bearOff);
      if (final.length > 0) return true;
    }
  }
  return false;
};

// 4:5 Choose-Double legality gate (PRD §4.2, R1/R2).
// Returns true iff all 4 pips of value `value` could be played legally from the
// current board, exhausting bar entries first, then any legal forward play
// (board moves + bear-offs). Deterministic — no randomness, no caching.
export const canFullyCompleteDouble = (
  board: number[],
  sign: PlayerSign,
  value: number,
): boolean => {
  if (value < 1 || value > 6) return false;

  let simBoard = [...board];
  // Use 4 identical pips; each loop consumes exactly one.
  let pipsLeft = 4;

  while (pipsLeft > 0) {
    const barIdx = sign === 1 ? 0 : 25;
    const onBar = Math.abs(simBoard[barIdx]) > 0;

    if (onBar) {
      // Bar-entry attempt for the rolled value. All four pips are identical,
      // so if entry is blocked for one, it's blocked for all remaining.
      const target = sign === 1 ? value : 25 - value;
      if (target < 1 || target > 24) return false;
      const occ = simBoard[target];
      if (Math.sign(occ) === -sign && Math.abs(occ) >= 2) return false;
      const r = applyMove(simBoard, barIdx, target, sign);
      simBoard = r.board;
      pipsLeft -= 1;
      continue;
    }

    // No bar piece — find ANY legal forward move of pip value `value`.
    // Use calculatePossibleMoves on each of the player's slots with a single
    // die [value] (no path-stacking ambiguity since one pip is consumed at a
    // time here). bearOff is allowed when the player can bear off.
    const bo = canBearOff(simBoard, sign);
    let made = false;
    for (let i = 1; i <= 24; i++) {
      if (Math.sign(simBoard[i]) !== sign) continue;
      const { final } = calculatePossibleMoves(simBoard, i, sign, [value], false, bo);
      if (final.length === 0) continue;
      // Prefer the first available destination — any legal move suffices for
      // the "can fully complete" question.
      const dest = final[0];
      const r = applyMove(simBoard, i, dest, sign);
      simBoard = r.board;
      made = true;
      break;
    }
    if (!made) return false;
    pipsLeft -= 1;
  }

  return true;
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
