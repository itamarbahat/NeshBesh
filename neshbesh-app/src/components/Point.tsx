import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Piece } from './Piece';
import { BEAR_OFF_WHITE, BEAR_OFF_BLACK } from '../engine';

// Max pieces to render individually before collapsing to count label
const MAX_VISIBLE = 6;

interface PointProps {
  index: number;       // Board index 1-24, or 0/25 for bars, or BEAR_OFF_* sentinels
  count: number;       // Positive = White pieces, Negative = Black pieces
  isTopRow: boolean;   // Determines which end the pieces stack from
  isSelected: boolean;
  isIntermediate: boolean;
  isFinal: boolean;
  onPress: (index: number) => void;
}

export const Point: React.FC<PointProps> = ({
  index,
  count,
  isTopRow,
  isSelected,
  isIntermediate,
  isFinal,
  onPress,
}) => {
  const absCount = Math.abs(count);
  const sign = (Math.sign(count) || 1) as 1 | -1;

  // Determine highlight appearance — priority: selected > final > intermediate
  const borderColor = isSelected
    ? '#FFD700'
    : isFinal
    ? '#32CD32'
    : isIntermediate
    ? '#1E90FF'
    : 'transparent';

  const overlayBg = isSelected
    ? 'rgba(255, 215, 0, 0.2)'
    : isFinal
    ? 'rgba(50, 205, 50, 0.22)'
    : isIntermediate
    ? 'rgba(30, 144, 255, 0.22)'
    : 'transparent';

  // Point triangle colour (alternating dark/light)
  const isEven = index % 2 === 0;
  const triangleColor = isEven ? '#7B3F20' : '#D4A56A';

  const renderPieces = () => {
    if (absCount === 0) return null;

    const visibleCount = Math.min(absCount, MAX_VISIBLE);
    const hasExtra = absCount > MAX_VISIBLE;
    // Negative overlap so pieces appear stacked
    const overlap = -8;

    const piecesArr = Array.from({ length: visibleCount }, (_, i) => (
      <View
        key={i}
        style={{
          marginTop: isTopRow ? (i === 0 ? 2 : overlap) : 0,
          marginBottom: !isTopRow ? (i === 0 ? 2 : overlap) : 0,
        }}
      >
        <Piece sign={sign} size={24} />
      </View>
    ));

    return (
      <View style={[styles.piecesContainer, { flexDirection: isTopRow ? 'column' : 'column-reverse' }]}>
        {piecesArr}
        {hasExtra && (
          <View style={[styles.countBadge, { backgroundColor: sign === 1 ? '#8B7355' : '#333' }]}>
            <Text style={[styles.countText, { color: sign === 1 ? '#FFF' : '#FFD700' }]}>
              ×{absCount}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.point,
        { borderColor, backgroundColor: triangleColor },
      ]}
      onPress={() => onPress(index)}
      activeOpacity={0.75}
    >
      {/* Highlight overlay */}
      {(isFinal || isIntermediate || isSelected) && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: overlayBg }]} />
      )}

      {/* Point number (small, decorative) */}
      <Text style={[styles.indexLabel, { top: isTopRow ? 2 : undefined, bottom: !isTopRow ? 2 : undefined }]}>
        {index}
      </Text>

      {renderPieces()}
    </TouchableOpacity>
  );
};

// ── Bar point (index 0 = White bar, index 25 = Black bar) ─────────────────────

interface BarProps {
  index: 0 | 25;
  count: number;
  isSelected: boolean;
  isFinal: boolean;
  onPress: (index: number) => void;
}

export const BarPoint: React.FC<BarProps> = ({ index, count, isSelected, isFinal, onPress }) => {
  const absCount = Math.abs(count);
  const sign = index === 0 ? 1 : -1; // White bar = 0, Black bar = 25

  const borderColor = isSelected ? '#FFD700' : isFinal ? '#32CD32' : 'transparent';

  return (
    <TouchableOpacity
      style={[styles.bar, { borderColor }]}
      onPress={() => onPress(index)}
      activeOpacity={0.75}
    >
      <Text style={styles.barLabel}>{index === 0 ? 'W' : 'B'}</Text>
      {absCount > 0 && (
        <View style={styles.barPieces}>
          {Array.from({ length: Math.min(absCount, 4) }, (_, i) => (
            <View key={i} style={{ marginVertical: 1 }}>
              <Piece sign={sign} size={20} />
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
  point: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 2,
    paddingHorizontal: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  piecesContainer: {
    alignItems: 'center',
    width: '100%',
    flex: 1,
  },
  indexLabel: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: 'bold',
    position: 'absolute',
    alignSelf: 'center',
  },
  countBadge: {
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginTop: 2,
    alignSelf: 'center',
  },
  countText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  bar: {
    width: 36,
    backgroundColor: '#2C1810',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  barLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  barPieces: {
    alignItems: 'center',
    gap: 2,
  },
  barCount: {
    color: '#FFD700',
    fontSize: 9,
    fontWeight: 'bold',
  },
});
