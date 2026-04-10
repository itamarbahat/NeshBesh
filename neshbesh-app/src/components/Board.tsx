import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { Slot, BarSlot } from './Slot';
import { BEAR_OFF_WHITE, BEAR_OFF_BLACK } from '../engine';

// ── Board layout indices (standard backgammon, White perspective) ──────────────
//   Top row  (→ right): 13 14 15 16 17 18 | BAR | 19 20 21 22 23 24
//   Bot row  (← right): 12 11 10  9  8  7 | BAR |  6  5  4  3  2  1
const TOP_LEFT  = [13, 14, 15, 16, 17, 18];
const TOP_RIGHT = [19, 20, 21, 22, 23, 24];
const BOT_LEFT  = [12, 11, 10, 9, 8, 7];
const BOT_RIGHT = [6, 5, 4, 3, 2, 1];

// Load the oak wood background asset
const oakWoodBg = require('../../assets/oak-wood-bg.png');

// ── Props ─────────────────────────────────────────────────────────────────────
interface BoardProps {
  board: number[];
  whiteBorneOff: number;
  blackBorneOff: number;
  selectedIndex: number | null;
  intermediateHighlights: number[];
  finalHighlights: number[];
  onPointPress: (index: number) => void;
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
}) => {
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
    />
  );

  const bearOffWhiteActive = finalHighlights.includes(BEAR_OFF_WHITE);
  const bearOffBlackActive = finalHighlights.includes(BEAR_OFF_BLACK);

  return (
    <View style={styles.boardOuter}>
      {/* ── Bear-off trays ──────────────────────────────────────────────── */}
      <View style={styles.bearOffRow}>
        <TouchableOpacity
          style={[styles.bearOffTray, bearOffBlackActive && styles.bearOffActive]}
          onPress={() => bearOffBlackActive && onPointPress(BEAR_OFF_BLACK)}
          activeOpacity={0.8}
        >
          <Text style={styles.bearOffLabel}>BLACK OFF</Text>
          <Text style={styles.bearOffCount}>{blackBorneOff}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[styles.bearOffTray, bearOffWhiteActive && styles.bearOffActive]}
          onPress={() => bearOffWhiteActive && onPointPress(BEAR_OFF_WHITE)}
          activeOpacity={0.8}
        >
          <Text style={styles.bearOffLabel}>WHITE OFF</Text>
          <Text style={styles.bearOffCount}>{whiteBorneOff}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Main board with wood background ─────────────────────────────── */}
      <View style={styles.borderFrame}>
        {/* Decorative corner accents */}
        <View style={[styles.cornerAccent, styles.cornerTL]} />
        <View style={[styles.cornerAccent, styles.cornerTR]} />
        <View style={[styles.cornerAccent, styles.cornerBL]} />
        <View style={[styles.cornerAccent, styles.cornerBR]} />

        <ImageBackground
          source={oakWoodBg}
          resizeMode="cover"
          style={styles.woodSurface}
          imageStyle={styles.woodImage}
        >
          {/* Subtle vignette / darkened overlay on wood */}
          <View style={styles.woodOverlay} />

          {/* ── TOP HALF ────────────────────────────────────────────────── */}
          <View style={styles.halfRow}>
            {/* Top-left quadrant */}
            <View style={styles.quadrant}>
              {TOP_LEFT.map(i => renderSlot(i, true))}
            </View>

            {/* Bar (Black bar = index 25) */}
            <BarSlot
              index={25}
              count={board[25] ?? 0}
              isSelected={selectedIndex === 25}
              isFinal={finalHighlights.includes(25)}
              onPress={onPointPress}
            />

            {/* Top-right quadrant */}
            <View style={styles.quadrant}>
              {TOP_RIGHT.map(i => renderSlot(i, true))}
            </View>
          </View>

          {/* ── BOTTOM HALF ─────────────────────────────────────────────── */}
          <View style={styles.halfRow}>
            {/* Bottom-left quadrant */}
            <View style={styles.quadrant}>
              {BOT_LEFT.map(i => renderSlot(i, false))}
            </View>

            {/* Bar (White bar = index 0) */}
            <BarSlot
              index={0}
              count={board[0] ?? 0}
              isSelected={selectedIndex === 0}
              isFinal={finalHighlights.includes(0)}
              onPress={onPointPress}
            />

            {/* Bottom-right quadrant */}
            <View style={styles.quadrant}>
              {BOT_RIGHT.map(i => renderSlot(i, false))}
            </View>
          </View>
        </ImageBackground>
      </View>
    </View>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  boardOuter: {
    width: '100%',
  },

  // ── Bear-off trays ──────────────────────────────────────────────────────────
  bearOffRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  bearOffTray: {
    backgroundColor: '#2A1808',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4A3218',
    minWidth: 78,
    // Inset shadow feel
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
    color: 'rgba(255,255,255,0.5)',
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

  // ── Board frame ─────────────────────────────────────────────────────────────
  borderFrame: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 5,
    borderColor: '#3E2210',
    backgroundColor: '#2A1208',
    // Deep shadow for the frame
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
    position: 'relative',
  },

  // ── Corner accents (decorative gold dots) ───────────────────────────────────
  cornerAccent: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C5A55A',
    zIndex: 20,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 3,
  },
  cornerTL: { top: 4, left: 4 },
  cornerTR: { top: 4, right: 4 },
  cornerBL: { bottom: 4, left: 4 },
  cornerBR: { bottom: 4, right: 4 },

  // ── Wood surface ────────────────────────────────────────────────────────────
  woodSurface: {
    width: '100%',
    aspectRatio: 0.82,
    padding: 4,
  },
  woodImage: {
    borderRadius: 8,
    opacity: 0.95,
  },
  woodOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,5,0,0.18)',
    borderRadius: 8,
  },

  // ── Half rows ───────────────────────────────────────────────────────────────
  halfRow: {
    flex: 1,
    flexDirection: 'row',
  },
  quadrant: {
    flex: 1,
    flexDirection: 'row',
    paddingTop: 2,
    paddingBottom: 2,
  },
});
