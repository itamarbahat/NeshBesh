import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { Piece } from './Piece';
import { BEAR_OFF_WHITE, BEAR_OFF_BLACK } from '../engine';
import { BOARD_FROZEN } from './boardConstants';

// ── Layout constants ──────────────────────────────────────────────────────────
const MAX_VISIBLE_PIECES = 7;

// ── Slot (game point / triangle cone) ─────────────────────────────────────────

interface SlotProps {
  index: number;
  count: number;         // Positive = White, Negative = Black
  isTopRow: boolean;
  isSelected: boolean;
  isIntermediate: boolean;
  isFinal: boolean;
  onPress: (index: number) => void;
  pieceSize: number;
}

/**
 * Redesigned as an elegant SVG cone that fills the full width of the column.
 */
export const Slot: React.FC<SlotProps> = ({
  index,
  count,
  isTopRow,
  isSelected,
  isIntermediate,
  isFinal,
  onPress,
  pieceSize,
}) => {
  const absCount = Math.abs(count);
  const sign = (Math.sign(count) || 1) as 1 | -1;
  const stackOverlap = Math.round(pieceSize * 0.18);

  // ── Cone colours — alternating dark / sandy beige ────────────────────────────
  const isDarkCone = index % 2 === 0;
  const coneColor = isDarkCone ? BOARD_FROZEN.CONE_DARK : BOARD_FROZEN.CONE_LIGHT;

  // ── Highlight state ─────────────────────────────────────────────────────
  const highlightBorder = isSelected
    ? '#FFD700'
    : isFinal
    ? '#32CD32'
    : isIntermediate
    ? '#1E90FF'
    : 'transparent';

  const highlightOverlay = isSelected
    ? 'rgba(255, 215, 0, 0.15)'
    : isFinal
    ? 'rgba(50, 205, 50, 0.18)'
    : isIntermediate
    ? 'rgba(30, 144, 255, 0.18)'
    : 'transparent';

  const isHighlighted = isSelected || isFinal || isIntermediate;

  // ── Piece rendering with >7 stacking ────────────────────────────────────
  const renderPieces = () => {
    if (absCount === 0) return null;

    const visibleCount = Math.min(absCount, MAX_VISIBLE_PIECES);
    const hasOverflow = absCount > MAX_VISIBLE_PIECES;

    const pieces = Array.from({ length: visibleCount }, (_, i) => {
      const isLast = i === visibleCount - 1;
      return (
        <View
          key={i}
          style={{
            marginTop: isTopRow ? (i === 0 ? 2 : -stackOverlap) : 0,
            marginBottom: !isTopRow ? (i === 0 ? 2 : -stackOverlap) : 0,
            zIndex: i + 1,
          }}
        >
          <Piece
            sign={sign}
            size={pieceSize}
            stackLabel={hasOverflow && isLast ? `×${absCount}` : undefined}
          />
        </View>
      );
    });

    return (
      <View
        style={[
          styles.piecesColumn,
          { flexDirection: isTopRow ? 'column' : 'column-reverse' },
        ]}
      >
        {pieces}
      </View>
    );
  };

  // ── SVG Cone ───────────────────────────────────────────────────────
  const renderCone = () => {
    // Cone stretches toward the horizontal center of the board.
    // viewBox height is tall to let the triangle reach further toward midline,
    // while the base always matches piece width (28px) via the slot flex.
    const points = isTopRow 
      ? "0,0 100,0 50,100"  // Triangle pointing DOWN
      : "0,100 100,100 50,0"; // Triangle pointing UP

    return (
      <View style={{ width: '100%', height: '90%' }}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Polygon
            points={points}
            fill={coneColor}
          />
        </Svg>
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.slotContainer,
        {
          borderColor: highlightBorder,
          borderWidth: isHighlighted ? 1.5 : 0,
        },
      ]}
      onPress={() => onPress(index)}
      activeOpacity={0.7}
    >
      {/* Highlight overlay */}
      {isHighlighted && (
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: highlightOverlay, borderRadius: 3 }]}
        />
      )}

      {/* Layout: cone behind, pieces in front */}
      <View
        style={[
          styles.coneAndPiecesContainer,
          { flexDirection: isTopRow ? 'column' : 'column-reverse' },
        ]}
      >
        {/* Pieces stacked from the base */}
        {renderPieces()}

        {/* Cone fills remaining space behind */}
        <View style={[styles.coneWrapper, { justifyContent: isTopRow ? 'flex-start' : 'flex-end' }]}>
          {renderCone()}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ── Bar Slot (Bar point for captured pieces at index 0 / 25) ──────────────────

interface BarSlotProps {
  index: 0 | 25;
  count: number;
  isSelected: boolean;
  isFinal: boolean;
  onPress: (index: number) => void;
  pieceSize: number;
}

export const BarSlot: React.FC<BarSlotProps> = ({
  index,
  count,
  isSelected,
  isFinal,
  onPress,
  pieceSize,
}) => {
  const absCount = Math.abs(count);
  const sign = (index === 0 ? 1 : -1) as 1 | -1;

  const borderColor = isSelected ? '#FFD700' : isFinal ? '#32CD32' : 'transparent';
  const barPieceSize = Math.round(pieceSize * 0.92);

  return (
    <TouchableOpacity
      style={[styles.bar, { borderColor }]}
      onPress={() => onPress(index)}
      activeOpacity={0.75}
    >
      {absCount > 0 && (
        <View style={styles.barPieces}>
          {Array.from({ length: Math.min(absCount, 4) }, (_, i) => (
            <View key={i} style={{ marginVertical: 1 }}>
              <Piece sign={sign} size={barPieceSize} />
            </View>
          ))}
          {absCount > 4 && (
            <Text style={styles.barCount}>+{absCount - 4}</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // ── Slot (cone point) ───────────────────────────────────────────────────────
  slotContainer: {
    flex: 1,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 3,
    marginHorizontal: 0.5,
  },
  coneAndPiecesContainer: {
    flex: 1,
    alignItems: 'center',
    width: '100%',
    justifyContent: 'flex-start',
  },
  coneWrapper: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 0,
  },
  coneTriangle: {
    width: 0,
    height: 0,
  },
  piecesColumn: {
    alignItems: 'center',
    width: '100%',
    zIndex: 2,
  },
  indexLabel: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: 'bold',
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 5,
  },

  // ── Bar ──────────────────────────────────────────────────────────────────────
  bar: {
    width: 22,
    backgroundColor: '#361E0E',
    borderWidth: 1,
    borderColor: '#4A3218',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderRadius: 1,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 3,
  },
  barLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  barPieces: {
    alignItems: 'center',
    gap: 2,
  },
  barCount: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
  },
});
