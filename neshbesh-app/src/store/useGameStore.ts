import { create } from 'zustand';
import {
  PlayerSign, Phase, Score, VictoryInfo,
} from '../types';
import {
  generateInitialBoard, rollDie, rollTwoDice,
  hasBarPieces, canBearOff,
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
}

const initialScore: Score = { whitePoints: 0, blackPoints: 0, whiteSets: 0, blackSets: 0 };

const resetTurnState = (player: PlayerSign) => ({
  currentPlayer: player,
  phase: 'WAITING_ROLL' as Phase,
  dice: null as [number, number] | null,
  availableDice: [] as number[],
  extraTurn: false,
  backward: false,
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
        set({ dice: [d1, d2], doublesCount: newCount, phase: 'MOVING', availableDice: [d1, d1, d1, d1], extraTurn: true, backward: false, message: `Double ${d1}s! Extra turn granted.` });
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
        set({ dice: [d1, d2], doublesCount: 0, phase: 'MOVING', availableDice: [5, 2], backward: true, message: '5:2 — Move 5 and 2 backwards!' });
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
      set({ dice: [d1, d2], doublesCount: 0, phase: 'MOVING', availableDice: [d1, d2], backward: false, message: null });
    },

    // ── rollSingleDie ─────────────────────────────────────────────────────────
    rollSingleDie: () => {
      const { phase } = get();
      const d = rollDie();
      if (phase === 'SPECIAL_43_ROLL') {
        set({ phase: 'SPECIAL_43_RESULT', availableDice: [d], backward: true, message: `לך אחורה ${d} צעדים` });
      } else if (phase === 'SPECIAL_51_ROLL') {
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
            // Extra turn after Nesh Strike — same player rolls again
            const s = get();
            set({
              ...resetTurnState(s.currentPlayer),
              doublesCount: s.doublesCount,
              score: s.score,
              board: s.board,
              whiteBorneOff: s.whiteBorneOff,
              blackBorneOff: s.blackBorneOff,
            });
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

      set({
        board: nb,
        whiteBorneOff: newWBO,
        blackBorneOff: newBBO,
        availableDice: newDice,
        selectedIndex: null,
        finalHighlights: [],
        intermediateHighlights: [],
        moveLocked: false, // Reset lock for next move
        backward: backward && newDice.length > 0, // Keep backward until dice exhausted
        message: captured ? 'Captured!' : borneOff ? 'Borne off!' : null,
      });

      afterMoveCheckDice(newDice);
    },

    // ── chooseDouble (4:5 special) ────────────────────────────────────────────
    chooseDouble: (value: number) => {
      set({ phase: 'MOVING', availableDice: [value, value, value, value], extraTurn: false, message: `Playing Double ${value}s!` });
    },

    // ── choose63 (6:3 special) ────────────────────────────────────────────────
    choose63: (reroll: boolean) => {
      if (reroll) {
        set({ phase: 'WAITING_ROLL', dice: null, availableDice: [], message: 'Re-rolling 6:3...' });
      } else {
        set({ phase: 'MOVING', message: null });
      }
    },

    // ── confirmTableFlip ──────────────────────────────────────────────────────
    confirmTableFlip: () => endTurnImpl(),

    // ── acknowledgeSkip (1:2) ─────────────────────────────────────────────────
    acknowledgeSkip: () => endTurnImpl(),

    // ── confirmSpecialResult (4:3 / 5:1 result acknowledged) ─────────────────
    confirmSpecialResult: () => {
      set({ phase: 'MOVING', message: null });
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
  };
});
