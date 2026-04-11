import { create } from 'zustand';
import {
  PlayerSign, Phase, Score, VictoryInfo,
} from '../types';
import {
  generateInitialBoard, rollDie, rollTwoDice,
  hasBarPieces, canBearOff, hasAnyMove,
  calculatePossibleMoves, getDiceAfterMove, applyMove,
  applyNeshStrike, getFreeMoveFinals, calculateVictory,
  BEAR_OFF_WHITE, BEAR_OFF_BLACK,
} from '../engine';

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

  // Scoring (first to 3 points = 1 set; first to 3 sets = championship)
  score: Score;
  victoryInfo: VictoryInfo | null;

  // Toast message for UI
  message: string | null;

  // Actions
  rollDice: () => void;
  rollSingleDie: () => void;
  handlePointPress: (index: number) => void;
  chooseDouble: (value: number) => void;
  choose63: (reroll: boolean) => void;
  confirmTableFlip: () => void;
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
  message: null as string | null,
});

export const useGameStore = create<NeshBeshState>((set, get) => {
  // ─── Internal helpers ──────────────────────────────────────────────────────

  const endTurnImpl = () => {
    const { currentPlayer, score, board, whiteBorneOff, blackBorneOff } = get();
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
    phase: 'WAITING_ROLL',
    dice: null,
    availableDice: [],
    doublesCount: 0,
    extraTurn: false,
    backward: false,
    pending52Flip: false,
    selectedIndex: null,
    intermediateHighlights: [],
    finalHighlights: [],
    moveLocked: false,
    neshStrikeFreeMovesLeft: 0,
    score: initialScore,
    victoryInfo: null,
    message: null,

    // ── rollDice ──────────────────────────────────────────────────────────────
    rollDice: () => {
      const { phase, doublesCount, currentPlayer: sign, board } = get();
      if (phase !== 'WAITING_ROLL' && phase !== 'SPECIAL_63_CHOICE') return;

      const [d1, d2] = rollTwoDice();
      const isDouble = d1 === d2;

      // ── Doubles path ────────────────────────────────────────────────────────
      if (isDouble) {
        const newCount = doublesCount + 1;
        if (newCount === 3) {
          set({ dice: [d1, d2], doublesCount: 0, phase: 'TABLE_FLIP', message: 'FLIP THE TABLE! 3 consecutive doubles.' });
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
        return;
      }

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
        set({
          board: nb, dice: [d1, d2], doublesCount: 0,
          phase: 'SPECIAL_NESH_STRIKE_FREE_MOVE',
          neshStrikeFreeMovesLeft: 2, availableDice: [],
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
        enterMovingOrSkip({
          dice: [d1, d2],
          availableDice: [5, 2],
          backward: true,
          message: '5:2 — Move 5 and 2 backwards!',
        });
        return;
      }
      if (is(4, 3)) {
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SPECIAL_43_ROLL', availableDice: [], message: '4:3 — Roll 1 die for your backward move!' });
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
        set({ phase: 'SPECIAL_43_RESULT', availableDice: [d], backward: true, message: `לך אחורה ${d} צעדים` });
      } else if (phase === 'SPECIAL_51_ROLL') {
        // Bar exception: with a bar piece, 5:1 becomes a single-die entry —
        // enter forward at the rolled value if possible, otherwise turn ends.
        const barCount = Math.abs(board[sign === 1 ? 0 : 25]);
        if (barCount >= 1) {
          enterMovingOrSkip({
            dice: [d, d],
            availableDice: [d],
            backward: false,
            extraTurn: false,
            message: `5:1 מהבר — ניסיון כניסה עם ${d}`,
          });
          return;
        }
        set({ phase: 'SPECIAL_51_RESULT', availableDice: [d, d, d, d], backward: false, extraTurn: false, message: `שחק דאבל ${d}` });
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
        if (selectedIndex === null) {
          if (Math.sign(board[index]) === sign) {
            set({ selectedIndex: index, finalHighlights: getFreeMoveFinals(board, sign), intermediateHighlights: [], moveLocked: false });
          }
        } else if (finalHighlights.includes(index)) {
          const { board: nb, captured } = applyMove(board, selectedIndex, index, sign);
          const movesLeft = state.neshStrikeFreeMovesLeft - 1;
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
          set({ selectedIndex: index, finalHighlights: getFreeMoveFinals(board, sign), intermediateHighlights: [], moveLocked: false });
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
          ? 'עכשיו שחק אחורה עם החייל השני'
          : (captured ? 'Captured!' : borneOff ? 'Borne off!' : null),
      });

      afterMoveCheckDice(newDice);
    },

    // ── chooseDouble (4:5 special) ────────────────────────────────────────────
    chooseDouble: (value: number) => {
      const { dice } = get();
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
    confirmTableFlip: () => endTurnImpl(),

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
        ...resetTurnState(1),
      });
    },

    // ── startWithDice (multiplayer initial roll) ──────────────────────────────
    startWithDice: (firstPlayer: PlayerSign, d1: number, d2: number) => {
      set({
        board: generateInitialBoard(),
        whiteBorneOff: 0,
        blackBorneOff: 0,
        doublesCount: 0,
        score: initialScore,
        victoryInfo: null,
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
        set({
          board: nb, dice: [d1, d2], doublesCount: 0,
          phase: 'SPECIAL_NESH_STRIKE_FREE_MOVE',
          neshStrikeFreeMovesLeft: 2, availableDice: [],
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
        enterMovingOrSkip({
          dice: [d1, d2],
          availableDice: [5, 2],
          backward: true,
          message: '5:2 — Move 5 and 2 backwards!',
        });
        return;
      }
      if (is(4, 3)) {
        set({ dice: [d1, d2], doublesCount: 0, phase: 'SPECIAL_43_ROLL', availableDice: [], message: '4:3 — Roll 1 die for your backward move!' });
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
