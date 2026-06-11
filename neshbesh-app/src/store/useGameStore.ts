import { create } from 'zustand';
import {
  PlayerSign, Phase, Score, VictoryInfo,
} from '../types';
import {
  generateInitialBoard, rollDie, rollTwoDice,
  hasBarPieces, canBearOff, hasAnyMove,
  calculatePossibleMoves, getDiceAfterMove, applyMove,
  applyNeshStrike, getFreeMoveFinals, calculateVictory,
  isBarEntryBlocked, resetMoveCache, canFullyCompleteDouble,
  BEAR_OFF_WHITE, BEAR_OFF_BLACK,
} from '../engine';

// Public helper: does the current game state have any legal move left for the
// active player with the current remaining dice? Used to drive the intelligent
// End Turn button visibility.
export const currentPlayerHasLegalMoves = (state: {
  board: number[];
  currentPlayer: PlayerSign;
  availableDice: number[];
  backward: boolean;
}): boolean => {
  if (state.availableDice.length === 0) return false;
  const bo = canBearOff(state.board, state.currentPlayer);
  return hasAnyMove(state.board, state.currentPlayer, state.availableDice, state.backward, bo);
};

// 4:5 chooser selectability gate (PRD §4.2, R1/R2).
// Returns the list of double values 1..6 that should be enabled in the chooser:
//   • If ANY v in 1..6 is fully completable from the current board, return ONLY
//     those completable values (the rest are visually disabled).
//   • Else (no value is fully completable), return all 6 as a fallback so the
//     player can still pick something even though some pips will be forfeit.
// Pure function — UI calls it directly with a state snapshot.
export const getChoosableDoubleValues = (state: {
  board: number[];
  currentPlayer: PlayerSign;
}): number[] => {
  const completable: number[] = [];
  for (let v = 1; v <= 6; v++) {
    if (canFullyCompleteDouble(state.board, state.currentPlayer, v)) completable.push(v);
  }
  if (completable.length > 0) return completable;
  return [1, 2, 3, 4, 5, 6];
};

export interface NeshBeshState {
  // Board
  board: number[];
  whiteBorneOff: number;
  blackBorneOff: number;

  // Turn
  currentPlayer: PlayerSign;
  phase: Phase;
  dice: [number, number] | null;
  availableDice: number[];
  doublesCount: number;
  extraTurn: boolean;
  backward: boolean; // 5:2 / 4:3 backward-move mode
  pending52Flip: boolean; // 5:2 bar-entry special: flip to backward after bar re-entry

  // 2-click selection
  selectedIndex: number | null;
  intermediateHighlights: number[];
  finalHighlights: number[];
  moveLocked: boolean; // Touched-moved (נגעת נסעת): once a destination is tapped, the move is locked.

  // 6:5 Nesh Strike free moves
  neshStrikeFreeMovesLeft: number;

  // 6:5 Nesh Strike: latched true at the moment of the trigger if the player
  // had bar pieces. When set, BOTH free moves' destinations are restricted to
  // the opponent's home territory (the first move is the bar entry; the second
  // move keeps the same target restriction even after the bar is cleared).
  // When false, both moves are unrestricted.
  neshStrikeStartedOnBar: boolean;

  // 5:1 four-move mode: rolled die value `d` grants 4 moves of value `d`.
  // Bar-entry and bear-off each consume one of the four moves (engine handles
  // pip math via getDiceAfterMove); this flag exists so future code can
  // distinguish 5:1 from a regular double for messaging / extra-turn logic.
  is51FourMove: boolean;

  // Streak of consecutive doubles that landed on a fully-blocked bar-entry
  // point. 3 in a row → Table Flip (US-009). Resets on any non-blocked roll
  // or whenever the player has no bar pieces.
  blockedDoubleStreak: number;

  // Scoring (first to 3 points = 1 set; first to 3 sets = championship)
  score: Score;
  victoryInfo: VictoryInfo | null;

  // Toast message for UI
  message: string | null;

  // Opening roll (INITIAL_ROLL phase) — each player rolls one die; higher
  // starts the game with both values as their opening move; tie triggers
  // a re-roll.
  openingWhiteDie: number | null;
  openingBlackDie: number | null;

  // Actions
  rollOpeningDie: (sign: PlayerSign) => void;
  rollDice: () => void;
  rollSingleDie: () => void;
  handlePointPress: (index: number) => void;
  chooseDouble: (value: number) => void;
  choose63: (reroll: boolean) => void;
  confirmTableFlip: (recolor?: boolean) => void;
  acknowledgeSkip: () => void;
  confirmSpecialResult: () => void;
  endTurn: () => void;
  startNewGame: () => void;
  startWithDice: (firstPlayer: PlayerSign, d1: number, d2: number) => void;
}

const initialScore: Score = { whitePoints: 0, blackPoints: 0, whiteSets: 0, blackSets: 0 };

const resetTurnState = (player: PlayerSign) => ({
  currentPlayer: player,
  phase: 'WAITING_ROLL' as Phase,
  dice: null as [number, number] | null,
  availableDice: [] as number[],
  extraTurn: false,
  backward: false,
  pending52Flip: false,
  selectedIndex: null as number | null,
  intermediateHighlights: [] as number[],
  finalHighlights: [] as number[],
  moveLocked: false,
  neshStrikeFreeMovesLeft: 0,
  neshStrikeStartedOnBar: false,
  is51FourMove: false,
  blockedDoubleStreak: 0,
  message: null as string | null,
});

// Module-scope handle for the blocked-double auto-reroll timer. Stored outside
// Zustand state so we can cancel a pending auto-roll the instant any fresh
// `rollDice` invocation arrives — eliminating the rare race where a manual
// mid-cooldown roll could cause two re-rolls to chain off the same cooldown.
let _autoRollTimeout: ReturnType<typeof setTimeout> | null = null;
const cancelPendingAutoRoll = () => {
  if (_autoRollTimeout !== null) {
    clearTimeout(_autoRollTimeout);
    _autoRollTimeout = null;
  }
};

// Module-scope handle for special-roll message auto-clear timer (5:2 / 4:3).
// Stored outside Zustand state so we can cancel an in-flight clear when the
// next state transition arrives (avoiding accidental cross-turn clears).
let _messageClearTimeout: ReturnType<typeof setTimeout> | null = null;
const cancelPendingMessageClear = () => {
  if (_messageClearTimeout !== null) {
    clearTimeout(_messageClearTimeout);
    _messageClearTimeout = null;
  }
};

export const useGameStore = create<NeshBeshState>((set, get) => {
  // ─── Internal helpers ──────────────────────────────────────────────────────

  // Schedule auto-clear of the `message` field after `ms` ms. The clear is a
  // no-op if the message has already changed by the time the timer fires
  // (snapshot equality check), so it can't stomp on a fresh message.
  const scheduleMessageClear = (snapshot: string, ms: number = 3000) => {
    cancelPendingMessageClear();
    _messageClearTimeout = setTimeout(() => {
      _messageClearTimeout = null;
      if (get().message === snapshot) set({ message: null });
    }, ms);
  };

  const endTurnImpl = () => {
    const { currentPlayer, score, board, whiteBorneOff, blackBorneOff } = get();
    cancelPendingAutoRoll();
    cancelPendingMessageClear();
    resetMoveCache();
    set({
      ...resetTurnState((-currentPlayer) as PlayerSign),
      doublesCount: 0,
      score, board, whiteBorneOff, blackBorneOff,
    });
  };

  // Transitions to MOVING phase; if the player has no legal moves with the given
  // dice, transitions to SKIP instead so the turn can end gracefully.
  const enterMovingOrSkip = (patch: {
    dice: [number, number];
    availableDice: number[];
    backward: boolean;
    doublesCount?: number;
    extraTurn?: boolean;
    message?: string | null;
  }) => {
    const { board, currentPlayer: sign } = get();
    const bo = canBearOff(board, sign);
    if (!hasAnyMove(board, sign, patch.availableDice, patch.backward, bo)) {
      set({
        dice: patch.dice,
        doublesCount: 0,
        phase: 'SKIP',
        availableDice: [],
        backward: false,
        extraTurn: false,
        selectedIndex: null,
        finalHighlights: [],
        intermediateHighlights: [],
        message: 'אין מהלכים חוקיים — תור עובר',
      });
      return;
    }
    set({
      dice: patch.dice,
      doublesCount: patch.doublesCount ?? 0,
      phase: 'MOVING',
      availableDice: patch.availableDice,
      backward: patch.backward,
      extraTurn: patch.extraTurn ?? false,
      message: patch.message ?? null,
    });
  };

  const afterMoveCheckDice = (newDice: number[]) => {
    if (newDice.length === 0) {
      const s = get();
      if (s.extraTurn) {
        // Same player rolls again; preserve board/score/doublesCount
        set({
          ...resetTurnState(s.currentPlayer),
          doublesCount: s.doublesCount,
          score: s.score,
          board: s.board,
          whiteBorneOff: s.whiteBorneOff,
          blackBorneOff: s.blackBorneOff,
        });
      } else {
        endTurnImpl();
      }
    }
  };

  const doVictoryCheck = (
    board: number[],
    sign: PlayerSign,
    whiteBorneOff: number,
    blackBorneOff: number,
  ): boolean => {
    const wentOff = sign === 1 ? whiteBorneOff >= 15 : blackBorneOff >= 15;
    if (!wentOff) return false;

    const loserBorneOff = sign === 1 ? blackBorneOff : whiteBorneOff;
    const victory = calculateVictory(board, sign, loserBorneOff);

    const oldScore = get().score;
    const newScore = { ...oldScore };

    if (victory.points === Infinity) {
      if (sign === 1) newScore.whiteSets = 3;
      else newScore.blackSets = 3;
    } else {
      if (sign === 1) newScore.whitePoints += victory.points;
      else newScore.blackPoints += victory.points;

      if (newScore.whitePoints >= 3) {
        newScore.whiteSets += 1;
        newScore.whitePoints = 0;
        newScore.blackPoints = 0;
      } else if (newScore.blackPoints >= 3) {
        newScore.blackSets += 1;
        newScore.whitePoints = 0;
        newScore.blackPoints = 0;
      }
    }

    const champion = newScore.whiteSets >= 3 || newScore.blackSets >= 3;
    set({
      score: newScore,
      victoryInfo: victory,
      phase: 'GAME_OVER',
      selectedIndex: null,
      finalHighlights: [],
      intermediateHighlights: [],
      message: `${sign === 1 ? 'White' : 'Black'} wins — ${victory.type}${champion ? ' · CHAMPIONSHIP!' : ''}`,
    });
    return true;
  };

  // ─── Store ─────────────────────────────────────────────────────────────────

  return {
    board: generateInitialBoard(),
    whiteBorneOff: 0,
    blackBorneOff: 0,
    currentPlayer: 1,
    phase: 'INITIAL_ROLL',
    dice: null,
    availableDice: [],
    openingWhiteDie: null,
    openingBlackDie: null,
    doublesCount: 0,
    extraTurn: false,
    backward: false,
    pending52Flip: false,
    selectedIndex: null,
    intermediateHighlights: [],
    finalHighlights: [],
    moveLocked: false,
    neshStrikeFreeMovesLeft: 0,
    neshStrikeStartedOnBar: false,
    is51FourMove: false,
    blockedDoubleStreak: 0,
    score: initialScore,
    victoryInfo: null,
    message: null,

    // ── rollOpeningDie (INITIAL_ROLL — single-device hotseat) ─────────────────
    rollOpeningDie: (sign: PlayerSign) => {
      const { phase, openingWhiteDie, openingBlackDie } = get();
      if (phase !== 'INITIAL_ROLL') return;
      if (sign === 1 && openingWhiteDie != null) return;
      if (sign === -1 && openingBlackDie != null) return;

      const d = rollDie();
      const newWhite = sign === 1 ? d : openingWhiteDie;
      const newBlack = sign === -1 ? d : openingBlackDie;
      set({ openingWhiteDie: newWhite, openingBlackDie: newBlack });

      if (newWhite != null && newBlack != null) {
        if (newWhite === newBlack) {
          // Tie — re-roll both after a brief pause (caller handles UI timing).
          setTimeout(() => {
            set({ openingWhiteDie: null, openingBlackDie: null });
          }, 900);
          return;
        }
        // Resolve to game start: winner plays both dice as opening move.
        const firstPlayer: PlayerSign = newWhite > newBlack ? 1 : -1;
        setTimeout(() => {
          get().startWithDice(firstPlayer, newWhite, newBlack);
        }, 900);
      }
    },

    // ── rollDice ──────────────────────────────────────────────────────────────
    rollDice: () => {
      // Cancel any pending blocked-double auto-reroll first. Whether this call
      // is manual or itself an auto-fire, the previous timer is now obsolete —
      // its result would be either redundant (we are about to roll fresh) or
      // would chain a second re-roll off the same cooldown.
      cancelPendingAutoRoll();
      const { phase, doublesCount, currentPlayer: sign, board } = get();
      if (phase !== 'WAITING_ROLL' && phase !== 'SPECIAL_63_CHOICE') return;

      const [d1, d2] = rollTwoDice();
      const isDouble = d1 === d2;

      // ── Doubles path ────────────────────────────────────────────────────────
      if (isDouble) {
        // US-008/009: if the player is on the Bar and the entry point is fully
        // blocked, the doubles roll cannot be played — re-roll. 3 such blocked
        // doubles in a row → Table Flip.
        if (hasBarPieces(board, sign) && isBarEntryBlocked(board, sign, d1)) {
          const newStreak = get().blockedDoubleStreak + 1;
          if (newStreak === 3) {
            set({
              dice: [d1, d2], doublesCount: 0, blockedDoubleStreak: 0,
              phase: 'TABLE_FLIP', availableDice: [],
              message: '3 כפולים חסומים — מהפך שולחן!',
            });
            return;
          }
          set({
            dice: [d1, d2], blockedDoubleStreak: newStreak,
            phase: 'WAITING_ROLL', availableDice: [],
            message: `דאבל ${d1} — כניסה חסומה, מתגלגל מחדש…`,
          });
          // Auto re-roll after a brief pause so the blocked message is visible.
          // The handle is module-scope so any fresh rollDice() (manual OR a
          // chained auto-roll) cancels this pending fire. Belt-and-braces
          // snapshot check on phase + dice handles the case where the player
          // navigated away between schedule and fire.
          const snap0 = d1, snap1 = d2;
          _autoRollTimeout = setTimeout(() => {
            _autoRollTimeout = null;
            const { phase: p, dice: cur } = get();
            if (p !== 'WAITING_ROLL') return;
            if (!cur || cur[0] !== snap0 || cur[1] !== snap1) return;
            get().rollDice();
          }, 1200);
          return;
        }

        const newCount = doublesCount + 1;
        if (newCount === 3) {
          set({ dice: [d1, d2], doublesCount: 0, blockedDoubleStreak: 0, phase: 'TABLE_FLIP', message: 'FLIP THE TABLE! 3 consecutive doubles.' });
          return;
        }
        enterMovingOrSkip({
          dice: [d1, d2],
          doublesCount: newCount,
          availableDice: [d1, d1, d1, d1],
          extraTurn: true,
          backward: false,
          message: `Double ${d1}s! Extra turn granted.`,
        });
        set({ blockedDoubleStreak: 0 });
        return;
      }

      // Any non-double roll resets the blocked-double streak.
      set({ blockedDoubleStreak: 0 });

      // ── Non-double specials ──────────────────────────────────────────────────
      const is = (a: number, b: number) => (d1 === a && d2 === b) || (d1 === b && d2 === a);

      if (is(1, 2)) {
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SKIP', availableDice: [], message: '1:2 — Turn skipped!' });
        return;
      }
      if (is(4, 5)) {
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SPECIAL_CHOOSE_DOUBLE', availableDice: [], message: '4:5 — Choose which double to play!' });
        return;
      }
      if (is(6, 5)) {
        const { board: nb, blotsCaptured } = applyNeshStrike(board, sign);
        // Latch "started on Bar" so BOTH free moves stay restricted to
        // opponent's home for the duration of this 6:5 turn — even after the
        // bar piece has entered and the bar is technically empty.
        const startedOnBar = hasBarPieces(nb, sign);
        // If the player started on the Bar AND opponent's home is fully blocked,
        // free moves cannot be played — turn is forfeited.
        if (startedOnBar && getFreeMoveFinals(nb, sign, true).length === 0) {
          set({
            board: nb, dice: [d1, d2], doublesCount: 0,
            phase: 'SKIP', availableDice: [],
            neshStrikeFreeMovesLeft: 0,
            neshStrikeStartedOnBar: false,
            selectedIndex: null, finalHighlights: [], intermediateHighlights: [],
            message: '6:5 — בית היריב חסום, אין כניסה',
          });
          return;
        }
        set({
          board: nb, dice: [d1, d2], doublesCount: 0,
          phase: 'SPECIAL_NESH_STRIKE_FREE_MOVE',
          neshStrikeFreeMovesLeft: 2, availableDice: [],
          neshStrikeStartedOnBar: startedOnBar,
          selectedIndex: null, finalHighlights: [], intermediateHighlights: [],
          message: `NESH STRIKE! ${blotsCaptured} blot${blotsCaptured !== 1 ? 's' : ''} sent to the Bar. 2 free moves!`,
        });
        return;
      }
      if (is(6, 3)) {
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SPECIAL_63_CHOICE', availableDice: [6, 3], message: '6:3 — Play normally or re-roll?' });
        return;
      }
      if (is(5, 2)) {
        // Bar exception: if player has bar pieces, enter forward first.
        // Single bar piece → forward entry counts as step 1, remaining die played backward from DIFFERENT piece.
        // 2+ bar pieces → both dice used forward for entry.
        const barCount = Math.abs(board[sign === 1 ? 0 : 25]);
        if (barCount >= 1) {
          enterMovingOrSkip({
            dice: [d1, d2],
            availableDice: [5, 2],
            backward: false,
            message: barCount >= 2
              ? '5:2 מהבר — שני החיילים נכנסים קדימה'
              : '5:2 מהבר — כניסה קדימה, אחר כך אחורה',
          });
          // Only single-bar case needs the flip; with 2+ bar pieces both dice remain forward.
          if (barCount === 1) set({ pending52Flip: true });
          return;
        }
        const msg52 = 'לך 5:2 אחורה!';
        enterMovingOrSkip({
          dice: [d1, d2],
          availableDice: [5, 2],
          backward: true,
          message: msg52,
        });
        scheduleMessageClear(msg52);
        return;
      }
      if (is(4, 3)) {
        const msg43 = 'הטל קוביה';
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SPECIAL_43_ROLL', availableDice: [], message: msg43 });
        scheduleMessageClear(msg43);
        return;
      }
      if (is(5, 1)) {
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SPECIAL_51_ROLL', availableDice: [], message: '5:1 — Roll 1 die to determine your double!' });
        return;
      }

      // Normal roll
      enterMovingOrSkip({
        dice: [d1, d2],
        availableDice: [d1, d2],
        backward: false,
        message: null,
      });
    },

    // ── rollSingleDie ─────────────────────────────────────────────────────────
    rollSingleDie: () => {
      const { phase, board, currentPlayer: sign } = get();
      const d = rollDie();
      if (phase === 'SPECIAL_43_ROLL') {
        // Bar exception: if player has bar pieces, enter forward at the rolled value
        // instead of playing backward. Turn ends after the single entry move.
        const barCount = Math.abs(board[sign === 1 ? 0 : 25]);
        if (barCount >= 1) {
          enterMovingOrSkip({
            dice: [d, d],
            availableDice: [d],
            backward: false,
            message: `4:3 מהבר — נכנס קדימה ${d}`,
          });
          return;
        }
        {
          const msg43r = `לך אחורה ${d} צעדים!`;
          set({ phase: 'SPECIAL_43_RESULT', availableDice: [d], backward: true, message: msg43r });
          scheduleMessageClear(msg43r);
        }
      } else if (phase === 'SPECIAL_51_ROLL') {
        // 5:1 always grants 4 moves of the rolled value. Bar entry and bear-off
        // each consume one of the four moves (engine handles pip math via
        // getDiceAfterMove). When on the Bar, the standard bar-first rule in
        // handlePointPress forces entry as the first move; if entry is blocked
        // and there are no other moves, enterMovingOrSkip falls through to SKIP.
        const barCount = Math.abs(board[sign === 1 ? 0 : 25]);
        if (barCount >= 1) {
          enterMovingOrSkip({
            dice: [d, d],
            availableDice: [d, d, d, d],
            backward: false,
            extraTurn: false,
            message: `5:1 מהבר — 4 מהלכים של ${d}`,
          });
          // Only flag if we actually transitioned to MOVING (entry not blocked).
          if (get().phase === 'MOVING') set({ is51FourMove: true });
          return;
        }
        set({ phase: 'SPECIAL_51_RESULT', availableDice: [d, d, d, d], backward: false, extraTurn: false, is51FourMove: true, message: `שחק דאבל ${d}` });
      }
    },

    // ── handlePointPress (2-click system with touched-moved enforcement) ──────
    handlePointPress: (index: number) => {
      const state = get();
      const {
        phase, board, currentPlayer: sign, availableDice, backward,
        selectedIndex, finalHighlights, intermediateHighlights,
        whiteBorneOff, blackBorneOff, moveLocked,
      } = state;

      // ── Nesh Strike free moves ──────────────────────────────────────────────
      if (phase === 'SPECIAL_NESH_STRIKE_FREE_MOVE') {
        // Restriction model (PRD §4.3, R4/R6 — live bar re-check):
        //   • Restriction is re-evaluated at the START of each free move from
        //     the LIVE board: if the player currently has a bar piece, this
        //     move is an entry into opponent's home (target restricted, and
        //     source forced to be the bar checker).
        //   • Once the bar is empty, restrictions lift — source = any of the
        //     player's checkers, target = any non-blocked board point.
        // This naturally handles 1-on-bar (move 1 enters → move 2 full-board)
        // and 2+-on-bar (move 1 enters, bar still occupied → move 2 still
        // restricted) without latching state.
        const barIdx = sign === 1 ? 0 : 25;
        const onBarNow = hasBarPieces(board, sign);
        const mustSelectBar = onBarNow;
        const targetRestricted = onBarNow;
        const finalsFromSource = (src: number): number[] => getFreeMoveFinals(board, sign, targetRestricted, src);

        if (selectedIndex === null) {
          if (mustSelectBar && index !== barIdx) return;
          if (Math.sign(board[index]) === sign) {
            set({ selectedIndex: index, finalHighlights: finalsFromSource(index), intermediateHighlights: [], moveLocked: false });
          }
        } else if (finalHighlights.includes(index) && index !== selectedIndex) {
          const { board: nb, captured } = applyMove(board, selectedIndex, index, sign);
          const movesLeft = state.neshStrikeFreeMovesLeft - 1;
          resetMoveCache();
          set({
            board: nb, selectedIndex: null, finalHighlights: [], intermediateHighlights: [],
            moveLocked: false,
            neshStrikeFreeMovesLeft: movesLeft,
            message: captured ? 'Captured!' : `Free move! ${movesLeft} left.`,
          });
          if (movesLeft === 0) {
            // Special rolls (including 6:5 Nesh Strike) do NOT grant an extra turn.
            // Only regular doubles do. End turn now.
            endTurnImpl();
          }
        } else if (Math.sign(board[index]) === sign) {
          if (mustSelectBar && index !== barIdx) return;
          set({ selectedIndex: index, finalHighlights: finalsFromSource(index), intermediateHighlights: [], moveLocked: false });
        }
        return;
      }

      if (phase !== 'MOVING') return;

      const bo = canBearOff(board, sign);
      const barIdx = sign === 1 ? 0 : 25;

      // ── Click 1: Selection ──────────────────────────────────────────────────
      if (selectedIndex === null) {
        // Enforce bar-first rule
        if (hasBarPieces(board, sign) && index !== barIdx) return;
        if (Math.sign(board[index]) !== sign && !(index === barIdx && Math.abs(board[barIdx]) > 0)) return;

        const { intermediate, final } = calculatePossibleMoves(board, index, sign, availableDice, backward, bo);
        set({ selectedIndex: index, intermediateHighlights: intermediate, finalHighlights: final, moveLocked: false });
        return;
      }

      // ── Click 2 ─────────────────────────────────────────────────────────────

      // «Touched-Moved» enforcement: if the move is locked, ignore deselect/re-select
      // Once the player taps a highlighted destination, the move cannot be undone.

      // Integrated bear-off: re-tapping the selected piece triggers the
      // bear-off move directly when bear-off is in its final set.
      const bearOffSentinel = sign === 1 ? BEAR_OFF_WHITE : BEAR_OFF_BLACK;
      if (index === selectedIndex && finalHighlights.includes(bearOffSentinel)) {
        // Redirect through the same click-2 branch but with the sentinel target.
        return get().handlePointPress(bearOffSentinel);
      }

      // Deselect (only allowed if not locked)
      if (index === selectedIndex && !moveLocked) {
        set({ selectedIndex: null, intermediateHighlights: [], finalHighlights: [], moveLocked: false });
        return;
      }
      if (index === selectedIndex && moveLocked) {
        // Move is locked — cannot deselect
        return;
      }

      // Re-select another own piece (only allowed if not locked)
      const isOwn = Math.sign(board[index]) === sign || (index === barIdx && Math.abs(board[barIdx]) > 0);
      if (isOwn && !finalHighlights.includes(index) && !intermediateHighlights.includes(index)) {
        if (moveLocked) return; // «Touched-Moved» — cannot change piece
        if (hasBarPieces(board, sign) && index !== barIdx) return;
        const { intermediate, final } = calculatePossibleMoves(board, index, sign, availableDice, backward, bo);
        set({ selectedIndex: index, intermediateHighlights: intermediate, finalHighlights: final, moveLocked: false });
        return;
      }

      // Execute move (highlighted destination)
      const isHighlighted = finalHighlights.includes(index) || intermediateHighlights.includes(index);
      if (!isHighlighted) return;

      // Bear-off clicks can come from board area — accept BEAR_OFF sentinels too
      const { board: nb, captured, borneOff } = applyMove(board, selectedIndex, index, sign);
      const newDice = getDiceAfterMove(availableDice, selectedIndex, index, sign, backward);
      resetMoveCache();

      let newWBO = whiteBorneOff;
      let newBBO = blackBorneOff;
      if (borneOff) {
        if (sign === 1) newWBO += 1;
        else newBBO += 1;
      }

      // Check for game over
      const won = doVictoryCheck(nb, sign, newWBO, newBBO);
      if (won) return;

      // 5:2 bar-entry special: after the single bar piece has entered forward,
      // flip to backward mode for the remaining die (from a different piece).
      const { pending52Flip } = get();
      const stillHasBar = Math.abs(nb[sign === 1 ? 0 : 25]) > 0;
      const shouldFlip52 = pending52Flip && !stillHasBar && newDice.length > 0;

      const flip52Msg = 'לך 5:2 אחורה!';
      set({
        board: nb,
        whiteBorneOff: newWBO,
        blackBorneOff: newBBO,
        availableDice: newDice,
        selectedIndex: null,
        finalHighlights: [],
        intermediateHighlights: [],
        moveLocked: false, // Reset lock for next move
        backward: shouldFlip52 ? true : (backward && newDice.length > 0),
        pending52Flip: shouldFlip52 ? false : pending52Flip,
        message: shouldFlip52
          ? flip52Msg
          : (captured ? 'Captured!' : borneOff ? 'Borne off!' : null),
      });
      if (shouldFlip52) scheduleMessageClear(flip52Msg);
      else cancelPendingMessageClear();

      afterMoveCheckDice(newDice);
    },

    // ── chooseDouble (4:5 special) ────────────────────────────────────────────
    chooseDouble: (value: number) => {
      const { dice, board, currentPlayer } = get();
      // Defensive legality gate (PRD §4.2). If the UI somehow forwards a value
      // that isn't in the choosable list (network race, stale state, etc.),
      // log and ignore rather than silently corrupting the move pool.
      if (value < 1 || value > 6) {
        if (typeof console !== 'undefined') console.warn(`[chooseDouble] ignored invalid value ${value}`);
        return;
      }
      const choosable = getChoosableDoubleValues({ board, currentPlayer });
      if (!choosable.includes(value)) {
        if (typeof console !== 'undefined') console.warn(`[chooseDouble] ignored non-choosable value ${value}`);
        return;
      }
      enterMovingOrSkip({
        dice: dice ?? [value, value],
        availableDice: [value, value, value, value],
        backward: false,
        extraTurn: false,
        message: `Playing Double ${value}s!`,
      });
    },

    // ── choose63 (6:3 special) ────────────────────────────────────────────────
    choose63: (reroll: boolean) => {
      if (reroll) {
        set({ phase: 'WAITING_ROLL', dice: null, availableDice: [], message: 'Re-rolling 6:3...' });
      } else {
        const { dice } = get();
        enterMovingOrSkip({
          dice: dice ?? [6, 3],
          availableDice: [6, 3],
          backward: false,
          message: null,
        });
      }
    },

    // ── confirmTableFlip ──────────────────────────────────────────────────────
    // 3 consecutive doubles = "Flip the Table". In LOCAL hotseat we literally
    // spin the board 180° AND swap every checker's colour (white↔black), bar
    // pieces included: newBoard[i] = -board[25 - i]. This mirror+recolour is a
    // pip-perfect symmetry — each checker keeps its exact distance-to-exit, it
    // just changes owner — so the player who rolled the doubles is now staring
    // at the opponent's army (recoloured to theirs) and vice-versa.
    //
    // currentPlayer is deliberately LEFT UNCHANGED: the dice stay the same
    // colour, but because every piece was recoloured, that colour is now the
    // *opponent's* army — so the opponent is the one who plays next, exactly as
    // the user described ("the dice remain the same colour but the player is
    // different"). Borne-off counts and the match score follow their owners
    // across the swap (white↔black) so totals and points stay attached to the
    // right human.
    //
    // In REMOTE two-device play each player is hard-bound to a fixed colour and
    // device (host = white, guest = black), so a colour swap would hand a player
    // their opponent's army. There we keep the classic behaviour — the turn
    // simply passes to the opponent (no recolour) — and pass recolor=false.
    confirmTableFlip: (recolor: boolean = true) => {
      if (!recolor) {
        endTurnImpl();
        return;
      }
      const { board, currentPlayer, score, whiteBorneOff, blackBorneOff } = get();
      cancelPendingAutoRoll();
      cancelPendingMessageClear();
      resetMoveCache();

      const flipped = new Array<number>(26);
      for (let i = 0; i < 26; i++) flipped[i] = -board[25 - i];

      set({
        // Keep the SAME colour active — the recoloured board makes the opponent
        // the controller of that colour.
        ...resetTurnState(currentPlayer),
        doublesCount: 0,
        board: flipped,
        // Pieces changed colour, so the borne-off tallies and the score follow
        // their owners white↔black.
        whiteBorneOff: blackBorneOff,
        blackBorneOff: whiteBorneOff,
        score: {
          whitePoints: score.blackPoints,
          blackPoints: score.whitePoints,
          whiteSets: score.blackSets,
          blackSets: score.whiteSets,
        },
      });
    },

    // ── acknowledgeSkip (1:2) ─────────────────────────────────────────────────
    acknowledgeSkip: () => endTurnImpl(),

    // ── confirmSpecialResult (4:3 / 5:1 result acknowledged) ─────────────────
    confirmSpecialResult: () => {
      const { dice, availableDice, backward } = get();
      enterMovingOrSkip({
        dice: dice ?? [0, 0] as any,
        availableDice,
        backward,
        extraTurn: false,
        message: null,
      });
    },

    // ── endTurn ───────────────────────────────────────────────────────────────
    endTurn: () => endTurnImpl(),

    // ── startNewGame ──────────────────────────────────────────────────────────
    startNewGame: () => {
      set({
        board: generateInitialBoard(),
        whiteBorneOff: 0,
        blackBorneOff: 0,
        doublesCount: 0,
        score: initialScore,
        victoryInfo: null,
        openingWhiteDie: null,
        openingBlackDie: null,
        ...resetTurnState(1),
        phase: 'INITIAL_ROLL',
      });
    },

    // ── startWithDice (opening roll resolved) ─────────────────────────────────
    // Winner of the opening die-roll plays both dice as their first move.
    startWithDice: (firstPlayer: PlayerSign, d1: number, d2: number) => {
      const { score } = get();
      set({
        board: generateInitialBoard(),
        whiteBorneOff: 0,
        blackBorneOff: 0,
        doublesCount: 0,
        score,
        victoryInfo: null,
        openingWhiteDie: null,
        openingBlackDie: null,
        ...resetTurnState(firstPlayer),
      });

      const sign = firstPlayer;
      const board = get().board;
      const isDouble = d1 === d2;

      if (isDouble) {
        enterMovingOrSkip({
          dice: [d1, d2],
          doublesCount: 1,
          availableDice: [d1, d1, d1, d1],
          extraTurn: true,
          backward: false,
          message: `Double ${d1}s! Extra turn granted.`,
        });
        return;
      }

      const is = (a: number, b: number) => (d1 === a && d2 === b) || (d1 === b && d2 === a);

      if (is(1, 2)) {
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SKIP', availableDice: [], message: '1:2 — Turn skipped!' });
        return;
      }
      if (is(4, 5)) {
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SPECIAL_CHOOSE_DOUBLE', availableDice: [], message: '4:5 — Choose which double to play!' });
        return;
      }
      if (is(6, 5)) {
        const { board: nb, blotsCaptured } = applyNeshStrike(board, sign);
        // Latch "started on Bar" so BOTH free moves stay restricted to
        // opponent's home for the duration of this 6:5 turn — even after the
        // bar piece has entered and the bar is technically empty.
        const startedOnBar = hasBarPieces(nb, sign);
        // If the player started on the Bar AND opponent's home is fully blocked,
        // free moves cannot be played — turn is forfeited.
        if (startedOnBar && getFreeMoveFinals(nb, sign, true).length === 0) {
          set({
            board: nb, dice: [d1, d2], doublesCount: 0,
            phase: 'SKIP', availableDice: [],
            neshStrikeFreeMovesLeft: 0,
            neshStrikeStartedOnBar: false,
            selectedIndex: null, finalHighlights: [], intermediateHighlights: [],
            message: '6:5 — בית היריב חסום, אין כניסה',
          });
          return;
        }
        set({
          board: nb, dice: [d1, d2], doublesCount: 0,
          phase: 'SPECIAL_NESH_STRIKE_FREE_MOVE',
          neshStrikeFreeMovesLeft: 2, availableDice: [],
          neshStrikeStartedOnBar: startedOnBar,
          selectedIndex: null, finalHighlights: [], intermediateHighlights: [],
          message: `NESH STRIKE! ${blotsCaptured} blot${blotsCaptured !== 1 ? 's' : ''} sent to the Bar. 2 free moves!`,
        });
        return;
      }
      if (is(6, 3)) {
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SPECIAL_63_CHOICE', availableDice: [6, 3], message: '6:3 — Play normally or re-roll?' });
        return;
      }
      if (is(5, 2)) {
        const barCount = Math.abs(board[sign === 1 ? 0 : 25]);
        if (barCount >= 1) {
          enterMovingOrSkip({
            dice: [d1, d2],
            availableDice: [5, 2],
            backward: false,
            message: barCount >= 2
              ? '5:2 מהבר — שני החיילים נכנסים קדימה'
              : '5:2 מהבר — כניסה קדימה, אחר כך אחורה',
          });
          if (barCount === 1) set({ pending52Flip: true });
          return;
        }
        const msg52 = 'לך 5:2 אחורה!';
        enterMovingOrSkip({
          dice: [d1, d2],
          availableDice: [5, 2],
          backward: true,
          message: msg52,
        });
        scheduleMessageClear(msg52);
        return;
      }
      if (is(4, 3)) {
        const msg43 = 'הטל קוביה';
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SPECIAL_43_ROLL', availableDice: [], message: msg43 });
        scheduleMessageClear(msg43);
        return;
      }
      if (is(5, 1)) {
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SPECIAL_51_ROLL', availableDice: [], message: '5:1 — Roll 1 die to determine your double!' });
        return;
      }

      enterMovingOrSkip({
        dice: [d1, d2],
        availableDice: [d1, d2],
        backward: false,
        message: null,
      });
    },
  };
});
