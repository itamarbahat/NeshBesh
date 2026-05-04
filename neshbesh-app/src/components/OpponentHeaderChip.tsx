import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { useGameStore } from '../store/useGameStore';
import { useMultiplayerStore } from '../store/useMultiplayerStore';

// Compact, never-mirrored header strip showing the REMOTE opponent's name,
// bear-off count, and an activity indicator — but never their dice values.
// `mySign` identifies the local player; opponent is the inverse.
interface Props {
  mySign: 1 | -1;
}

export const OpponentHeaderChip: React.FC<Props> = ({ mySign }) => {
  const opponentName = useMultiplayerStore((s) => s.opponentName);
  const { currentPlayer, phase, whiteBorneOff, blackBorneOff } = useGameStore();

  const opponentSign = mySign === 1 ? -1 : 1;
  const isOpponentTurn = currentPlayer === opponentSign;
  const opponentBorne = opponentSign === 1 ? whiteBorneOff : blackBorneOff;

  const activityText = !isOpponentTurn
    ? null
    : phase === 'WAITING_ROLL'
      ? 'Rolling…'
      : phase === 'MOVING'
        ? 'Thinking…'
        : phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL'
          ? 'Rolling…'
          : 'Playing…';

  return (
    <View style={styles.chip}>
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={1}>
          {opponentName || 'יריב'}
        </Text>
        <Text style={styles.borne}>Off: {opponentBorne}/15</Text>
      </View>
      {activityText && (
        <MotiView
          from={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 700, loop: true, repeatReverse: true }}
        >
          <Text style={styles.activity}>{activityText}</Text>
        </MotiView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minWidth: 180,
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: '#FFF', fontSize: 13, fontWeight: '800', maxWidth: 140 },
  borne: { color: '#FFD700', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  activity: {
    color: 'rgba(50,205,50,0.85)',
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 2,
    letterSpacing: 0.5,
  },
});
