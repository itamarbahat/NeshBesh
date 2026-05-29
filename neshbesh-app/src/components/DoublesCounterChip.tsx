import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGameStore } from '../store/useGameStore';

interface DoublesCounterChipProps {
  /** Which player this chip belongs to. Counter only shows when it's their turn. */
  side: 1 | -1;
  /**
   * Optional compact variant — same content, smaller paddings/font. Use inside
   * tight rows (e.g. landscape sidebar Borne pair, RemoteBottomBar left column).
   */
  compact?: boolean;
}

/**
 * Live "consecutive doubles" indicator shown alongside the bear-off counter
 * (PRD §3.1, §4.5). Per CLAUDE.md, on the 3rd consecutive double the table
 * flips — so this chip is the early-warning UI for that event.
 *
 * Counter source: `state.doublesCount` (engine increments on regular doubles,
 * resets on non-double / new turn). Each chip is per-player, so we only
 * surface the active player's count and render a dim "0" for the opposite
 * side to keep layouts stable across turns.
 *
 * Visual encoding:
 *   • 0 → subdued grey chip
 *   • 1 → warm amber chip
 *   • 2 → red/orange "on the brink" chip
 */
export const DoublesCounterChip: React.FC<DoublesCounterChipProps> = ({ side, compact = false }) => {
  const doublesCount = useGameStore((s) => s.doublesCount);
  const currentPlayer = useGameStore((s) => s.currentPlayer);

  // Only show a real count for the active player — opponents always read 0.
  const count = currentPlayer === side ? doublesCount : 0;

  const tone =
    count >= 2 ? 'danger' :
    count >= 1 ? 'warn'  :
    'idle';

  const chipStyle = [
    compact ? styles.chipCompact : styles.chip,
    tone === 'warn'   && styles.chipWarn,
    tone === 'danger' && styles.chipDanger,
  ];
  const numStyle = [
    compact ? styles.numCompact : styles.num,
    tone === 'warn'   && styles.numWarn,
    tone === 'danger' && styles.numDanger,
  ];
  const iconStyle = [
    compact ? styles.iconCompact : styles.icon,
    tone === 'idle' && styles.iconIdle,
  ];

  return (
    <View style={chipStyle}>
      <Text style={iconStyle}>🎲</Text>
      <Text style={numStyle}>{count}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(40, 30, 22, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(110, 95, 80, 0.45)',
    minWidth: 44,
    justifyContent: 'center',
  },
  chipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(40, 30, 22, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(110, 95, 80, 0.45)',
    minWidth: 32,
    justifyContent: 'center',
  },
  chipWarn: {
    backgroundColor: 'rgba(255, 165, 0, 0.18)',
    borderColor: 'rgba(255, 165, 0, 0.75)',
    shadowColor: '#FFA500',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 3,
  },
  chipDanger: {
    backgroundColor: 'rgba(255, 69, 0, 0.22)',
    borderColor: '#FF4500',
    shadowColor: '#FF4500',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 5,
  },
  icon: {
    fontSize: 12,
  },
  iconCompact: {
    fontSize: 9,
  },
  iconIdle: {
    opacity: 0.55,
  },
  num: {
    color: 'rgba(255, 235, 200, 0.65)',
    fontSize: 13,
    fontWeight: '800',
  },
  numCompact: {
    color: 'rgba(255, 235, 200, 0.65)',
    fontSize: 10,
    fontWeight: '800',
  },
  numWarn: {
    color: '#FFA500',
  },
  numDanger: {
    color: '#FF4500',
  },
});
