import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { useGameStore } from '../store/useGameStore';
import { generateInitialBoard } from '../engine';

/**
 * Modal overlay for special states that genuinely block the game:
 * - SKIP (1:2)
 * - SPECIAL_63_CHOICE (6:3)
 * - TABLE_FLIP (3 consecutive doubles)
 * - GAME_OVER
 *
 * NOTE: 4:5 / 4:3 / 5:1 are now handled inline (DoubleChooserPanel / SingleDieRoller)
 * so they are no longer shown here.
 */
export const SpecialRollOverlay: React.FC = () => {
  const state = useGameStore();
  const {
    phase, score, victoryInfo,
    choose63,
    acknowledgeSkip, confirmTableFlip, startNewGame,
  } = state;

  const visible =
    phase === 'TABLE_FLIP' ||
    phase === 'GAME_OVER';

  if (!visible) return null;

  const startNextGame = () => {
    useGameStore.setState({
      board: generateInitialBoard(),
      whiteBorneOff: 0,
      blackBorneOff: 0,
      victoryInfo: null,
      currentPlayer: state.currentPlayer === 1 ? -1 : 1,
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
      message: null,
    });
  };

  const championship = score.whiteSets >= 3 || score.blackSets >= 3;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>

          {phase === 'SKIP' && (
            <>
              <Text style={styles.emoji}>😶</Text>
              <Text style={styles.title}>1:2 — Turn Skipped!</Text>
              <Text style={styles.body}>This roll ends your turn immediately.</Text>
              <Btn label="OK" onPress={acknowledgeSkip} />
            </>
          )}

          {phase === 'TABLE_FLIP' && (
            <>
              <MotiView
                from={{ rotate: '0deg', scale: 1 }}
                animate={{ rotate: '180deg', scale: 1.5 }}
                transition={{ type: 'timing', duration: 800 }}
              >
                <Text style={{ fontSize: 60 }}>🃏</Text>
              </MotiView>
              <Text style={styles.title}>FLIP THE TABLE!</Text>
              <Text style={styles.body}>3 consecutive doubles — turn passes to opponent.</Text>
              <Btn label="Continue" onPress={confirmTableFlip} />
            </>
          )}

          {phase === 'GAME_OVER' && (
            <>
              <Text style={styles.emoji}>{championship ? '🏆' : '✅'}</Text>
              <Text style={styles.title}>
                {championship ? 'CHAMPIONSHIP!' : 'Game Over'}
              </Text>
              {victoryInfo && (
                <Text style={styles.victoryType}>
                  {victoryInfo.type}
                  {victoryInfo.points === Infinity ? ' — Instant Championship!' : ` (+${victoryInfo.points} pts)`}
                </Text>
              )}
              <View style={styles.scoreBox}>
                <Text style={styles.scoreRow}>
                  White — {score.whiteSets} sets · {score.whitePoints} pts
                </Text>
                <Text style={styles.scoreRow}>
                  Black — {score.blackSets} sets · {score.blackPoints} pts
                </Text>
              </View>
              {championship ? (
                <Btn label="New Championship" onPress={startNewGame} />
              ) : (
                <Btn label="Next Game" onPress={startNextGame} />
              )}
            </>
          )}

        </View>
      </View>
    </Modal>
  );
};

const Btn: React.FC<{
  label: string;
  onPress: () => void;
  secondary?: boolean;
  small?: boolean;
}> = ({ label, onPress, secondary = false, small = false }) => (
  <TouchableOpacity
    style={[styles.btn, secondary && styles.btnSecondary, small && styles.btnSmall]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={[styles.btnText, small && styles.btnTextSmall]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1A0D05',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,200,100,0.25)',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 14,
  },
  emoji: {
    fontSize: 52,
  },
  title: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  body: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  victoryType: {
    color: '#FFC84A',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  scoreBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    gap: 4,
  },
  scoreRow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    backgroundColor: '#7B3F20',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A0552A',
    minWidth: 120,
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: '#2E2E2E',
    borderColor: '#555',
  },
  btnSmall: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 70,
  },
  btnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  btnTextSmall: {
    fontSize: 13,
  },
});
