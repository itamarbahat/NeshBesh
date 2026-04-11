import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Slot, BarSlot } from './Slot';
import { BEAR_OFF_WHITE, BEAR_OFF_BLACK } from '../engine';
import { BOARD_FROZEN, BOARD_ASPECT } from './boardConstants';

// Re-export for components that import these from Board.tsx.
export { BOARD_FROZEN, BOARD_ASPECT };

// ── Board layout indices (standard backgammon, White perspective) ──────────────
//   Top row  (→ right): 13 14 15 16 17 18 | BAR | 19 20 21 22 23 24
//   Bot row  (← right): 12 11 10  9  8  7 | BAR |  6  5  4  3  2  1
const TOP_LEFT  = [13, 14, 15, 16, 17, 18];
const TOP_RIGHT = [19, 20, 21, 22, 23, 24];
const BOT_LEFT  = [12, 11, 10, 9, 8, 7];
const BOT_RIGHT = [6, 5, 4, 3, 2, 1];


// ── Honey-tan wood grain: deterministic streaks generated at module load ─────
// so the pattern is stable across re-renders. Matches the natural light wood
// of the reference photo (user's mother's backgammon board).
const GRAIN_LINES = Array.from({ length: 42 }, (_, i) => {
  const center = (i + 0.5) * (100 / 42);
  const jitter = Math.sin(i * 2.7) * 1.0;
  const parity = i % 4;
  return {
    leftPct: center + jitter,
    width: parity === 0 ? 1.2 : parity === 1 ? 0.6 : 0.35,
    opacity: 0.04 + Math.abs(Math.sin(i * 1.3)) * 0.10,
    color: i % 2 === 0 ? '#5A2E0A' : '#F2D6A0',
  };
});

// ── Props ─────────────────────────────────────────────────────────────────────
interface BoardProps {
  board: number[];
  whiteBorneOff: number;
  blackBorneOff: number;
  selectedIndex: number | null;
  intermediateHighlights: number[];
  finalHighlights: number[];
  onPointPress: (index: number) => void;
  /** Board pixel width — used to compute piece & bar sizes uniformly. */
  boardWidth: number;
  /** Portrait layout has its own per-player bear-off buttons, so the top tray is hidden there. */
  showBearOffRow?: boolean;
}

// ── Board component ───────────────────────────────────────────────────────────
export const Board: React.FC<BoardProps> = ({
  board,
  whiteBorneOff,
  blackBorneOff,
  selectedIndex,
  intermediateHighlights,
  finalHighlights,
  onPointPress,
  boardWidth,
  showBearOffRow = true,
}) => {
  // Compute slot and piece sizes from the actual board width (same on every device).
  // Board contains: 12 slots + 1 center bar. Frame border ≈ 16px total.
  const innerWidth = boardWidth - 16;
  const barWidth = Math.round(innerWidth * BOARD_FROZEN.BAR_WIDTH_RATIO);
  const slotWidth = (innerWidth - barWidth) / 12;
  const pieceSize = Math.round(slotWidth * BOARD_FROZEN.PIECE_SLOT_RATIO);

  const renderSlot = (idx: number, isTopRow: boolean) => (
    <Slot
      key={idx}
      index={idx}
      count={board[idx] ?? 0}
      isTopRow={isTopRow}
      isSelected={selectedIndex === idx}
      isIntermediate={intermediateHighlights.includes(idx)}
      isFinal={finalHighlights.includes(idx)}
      onPress={onPointPress}
      pieceSize={pieceSize}
    />
  );

  const bearOffWhiteActive = finalHighlights.includes(BEAR_OFF_WHITE);
  const bearOffBlackActive = finalHighlights.includes(BEAR_OFF_BLACK);

  return (
    <View style={[styles.boardOuter, { width: boardWidth }]}>
      {/* ── Bear-off trays (landscape only) ─────────────────────────────
          Order matches player positions: WHITE on the left (top player),
          BLACK on the right (bottom player). In portrait mode the
          PlayerDiceBar provides per-player bear-off buttons instead. */}
      {showBearOffRow && (
        <View style={styles.bearOffRow}>
          <TouchableOpacity
            style={[styles.bearOffTray, bearOffWhiteActive && styles.bearOffActive]}
            onPress={() => bearOffWhiteActive && onPointPress(BEAR_OFF_WHITE)}
            activeOpacity={0.8}
          >
            <Text style={styles.bearOffLabel}>WHITE OFF</Text>
            <Text style={styles.bearOffCount}>{whiteBorneOff}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.bearOffTray, bearOffBlackActive && styles.bearOffActive]}
            onPress={() => bearOffBlackActive && onPointPress(BEAR_OFF_BLACK)}
            activeOpacity={0.8}
          >
            <Text style={styles.bearOffLabel}>BLACK OFF</Text>
            <Text style={styles.bearOffCount}>{blackBorneOff}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Main board with wood background ─────────────────────────────── */}
      <View style={[styles.borderFrame, { width: boardWidth, height: boardWidth / BOARD_ASPECT }]}>
        <View style={styles.woodSurface}>
          {/* Vertical honey-tan wood grain streaks */}
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            {GRAIN_LINES.map((g, i) => (
              <View
                key={`gl-${i}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${g.leftPct}%`,
                  width: g.width,
                  backgroundColor: g.color,
                  opacity: g.opacity,
                }}
              />
            ))}
          </View>

          {/* Subtle vignette */}
          <View style={styles.woodOverlay} />

          {/* ── TOP HALF ────────────────────────────────────────────────── */}
          <View style={styles.halfRow}>
            <View style={styles.quadrant}>
              {TOP_LEFT.map(i => renderSlot(i, true))}
            </View>

            {/* Top half of center bar = Black's bar (index 25) */}
            <View style={[styles.centerBarHalf, { width: barWidth }]}>
              <BarSlot
                index={25}
                count={board[25] ?? 0}
                isSelected={selectedIndex === 25}
                isFinal={finalHighlights.includes(25)}
                onPress={onPointPress}
                pieceSize={pieceSize}
              />
            </View>

            <View style={styles.quadrant}>
              {TOP_RIGHT.map(i => renderSlot(i, true))}
            </View>
          </View>

          {/* ── BOTTOM HALF ─────────────────────────────────────────────── */}
          <View style={styles.halfRow}>
            <View style={styles.quadrant}>
              {BOT_LEFT.map(i => renderSlot(i, false))}
            </View>

            {/* Bottom half of center bar = White's bar (index 0) */}
            <View style={[styles.centerBarHalf, { width: barWidth }]}>
              <BarSlot
                index={0}
                count={board[0] ?? 0}
                isSelected={selectedIndex === 0}
                isFinal={finalHighlights.includes(0)}
                onPress={onPointPress}
                pieceSize={pieceSize}
              />
            </View>

            <View style={styles.quadrant}>
              {BOT_RIGHT.map(i => renderSlot(i, false))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  boardOuter: {
    alignSelf: 'center',
  },

  // ── Bear-off trays ──────────────────────────────────────────────────────────
  bearOffRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  bearOffTray: {
    backgroundColor: BOARD_FROZEN.TRAY_BG,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: BOARD_FROZEN.TRAY_BORDER,
    minWidth: 78,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  bearOffActive: {
    borderColor: '#32CD32',
    backgroundColor: 'rgba(50, 205, 50, 0.15)',
    shadowColor: '#32CD32',
    shadowOpacity: 0.3,
  },
  bearOffLabel: {
    color: 'rgba(255,235,200,0.65)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  bearOffCount: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 1,
  },

  // ── Board frame — warm honey wood matching the reference photo ──────────────
  borderFrame: {
    borderRadius: 6,
    borderWidth: 8,
    borderColor: BOARD_FROZEN.WOOD_FRAME,
    backgroundColor: BOARD_FROZEN.WOOD_SURFACE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.65,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
    position: 'relative',
  },

  // ── Wood surface — natural honey-tan base ───────────────────────────────────
  woodSurface: {
    flex: 1,
    backgroundColor: BOARD_FROZEN.WOOD_SURFACE,
    borderRadius: 2,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  woodOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BOARD_FROZEN.WOOD_OVERLAY,
  },

  // ── Half rows ───────────────────────────────────────────────────────────────
  halfRow: {
    flex: 1,
    flexDirection: 'row',
  },
  quadrant: {
    flex: 1,
    flexDirection: 'row',
  },

  // ── Center bar half — clean uniform wood strip, no hinges/latches/lines ─────
  centerBarHalf: {
    backgroundColor: BOARD_FROZEN.WOOD_BAR,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
