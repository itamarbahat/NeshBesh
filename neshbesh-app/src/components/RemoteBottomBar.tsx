import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { useGameStore, currentPlayerHasLegalMoves } from '../store/useGameStore';
import { DicePanel } from './DicePanel';
import { DoublesCounterChip } from './DoublesCounterChip';

// Bottom-anchored, never-mirrored controls for remote two-device play.
// Always shows the LOCAL player's dice + status + (conditional) End Turn.
// `mySign` identifies which player this device is so opponent turns are
// rendered as a passive "waiting" state without surfacing dice values.
interface Props {
  mySign: 1 | -1;
  getStatusText: () => string;
  handleRoll: (velocity: number) => void;
  isSingleDiePhase: boolean;
  endTurnOverride?: () => void;
  dieSize: number;
}

export const RemoteBottomBar: React.FC<Props> = ({
  mySign, getStatusText, handleRoll, isSingleDiePhase, endTurnOverride, dieSize,
}) => {
  // Narrowed selectors — bottom bar is permanently mounted; a full subscription
  // re-renders the DicePanel on every highlight/message tick.
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const whiteBorneOff = useGameStore((s) => s.whiteBorneOff);
  const blackBorneOff = useGameStore((s) => s.blackBorneOff);
  const phase = useGameStore((s) => s.phase);
  const dice = useGameStore((s) => s.dice);
  const availableDice = useGameStore((s) => s.availableDice);
  const board = useGameStore((s) => s.board);
  const backward = useGameStore((s) => s.backward);
  const endTurn = useGameStore((s) => s.endTurn);

  const isMyTurn = currentPlayer === mySign;
  const end = endTurnOverride || endTurn;

  const noLegalMoves = isMyTurn
    && phase === 'MOVING'
    && availableDice.length > 0
    && !currentPlayerHasLegalMoves({ board, currentPlayer, availableDice, backward });

  const myBorne = mySign === 1 ? whiteBorneOff : blackBorneOff;
  const myLabel = mySign === 1 ? 'WHITE' : 'BLACK';

  return (
    <MotiView
      from={{ borderColor: 'rgba(255,255,255,0.08)' }}
      animate={{ borderColor: isMyTurn ? 'rgba(50,205,50,0.85)' : 'rgba(255,255,255,0.08)' }}
      transition={{
        type: 'timing',
        duration: isMyTurn ? 1100 : 0,
        loop: isMyTurn,
        repeatReverse: true,
      }}
      style={[styles.bar, !isMyTurn && styles.barDim]}
    >
      <View style={styles.left}>
        <Text style={styles.label}>{myLabel}</Text>
        <Text style={styles.status} numberOfLines={1}>
          {isMyTurn ? getStatusText() : 'תור היריב…'}
        </Text>
        <View style={styles.borneRow}>
          <Text style={styles.borne}>Off: {myBorne}/15</Text>
          <DoublesCounterChip side={mySign} compact />
        </View>
      </View>

      <View style={styles.center}>
        {isMyTurn ? (
          <DicePanel
            rolledDice={dice}
            availableDice={availableDice}
            canRoll={phase === 'WAITING_ROLL' || phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL'}
            onRoll={handleRoll}
            currentPlayer={currentPlayer}
            whiteBorneOff={whiteBorneOff}
            blackBorneOff={blackBorneOff}
            singleDie={isSingleDiePhase}
            dieSize={dieSize}
          />
        ) : (
          <View style={styles.idle}>
            <Text style={styles.idleText}>— ממתין לתורך —</Text>
          </View>
        )}
      </View>

      <View style={styles.right}>
        {noLegalMoves && (
          <TouchableOpacity
            style={styles.endBtn}
            onPress={end}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.endBtnText}>No moves · End</Text>
          </TouchableOpacity>
        )}
      </View>
    </MotiView>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 6,
    marginVertical: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 8,
    overflow: 'hidden',
    // Stable bar height across DicePanel state transitions so the board does
    // not shift vertically between my-turn / opponent-turn (US-005).
    minHeight: 96,
  },
  barDim: { opacity: 0.55 },
  left: { width: 76, alignItems: 'flex-start' },
  label: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  status: { color: 'rgba(255,255,255,0.5)', fontSize: 9, fontStyle: 'italic', marginTop: 2 },
  borne: { color: '#FFD700', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  borneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 70 },
  right: { width: 76, alignItems: 'flex-end', gap: 4 },
  idle: { opacity: 0.4, paddingVertical: 20 },
  idleText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontStyle: 'italic' },
  endBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,69,0,0.12)',
    borderWidth: 1,
    borderColor: '#FF4500',
  },
  endBtnText: { color: '#FF4500', fontSize: 10, fontWeight: '900' },
});
