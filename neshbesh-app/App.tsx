import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated as RNAnimated,
  useWindowDimensions,
  Modal,
  Pressable,
} from 'react-native';
import ReanimatedView from 'react-native-reanimated';
import { MotiView } from 'moti';
import { StatusBar } from 'expo-status-bar';
import { Trophy, X, Info } from 'lucide-react-native';
import { useGameStore, currentPlayerHasLegalMoves } from './src/store/useGameStore';
import { useMultiplayerStore } from './src/store/useMultiplayerStore';
import { LobbyScreen } from './src/screens/LobbyScreen';
import {
  syncGameState, subscribeToActions, clearPendingAction,
  subscribeToGameState, sendGuestAction, clearInitialDice,
} from './src/services/multiplayerService';
import { Board, BOARD_ASPECT } from './src/components/Board';
import { BOARD_FROZEN } from './src/components/boardConstants';
import { DicePanel, DieFace } from './src/components/DicePanel';
import { DoubleChooserPanel } from './src/components/DoubleChooserPanel';
import { SpecialRollOverlay } from './src/components/SpecialRollOverlay';
import { ThrowingDiceOverlay } from './src/components/ThrowingDiceOverlay';
import { useTableFlipAnimation } from './src/animations';
import { useAudioManager } from './src/audio/useAudioManager';
import { PlayerSign } from './src/types';

// ... (ScoreModal, ChoiceOverlay, DoubleChoiceOverlay, BorneBadge, EatImpactFlash remain same)
// ── Score Modal ─────────────────────────────────────────────────────────────
const ScoreModal: React.FC<{ visible: boolean; onClose: () => void; score: any; victoryInfo: any; onResetTournament: () => void; }> = ({ visible, onClose, score, victoryInfo, onResetTournament }) => {
  const [confirming, setConfirming] = useState(false);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <MotiView from={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={styles.scoreModalContent}>
          <View style={styles.scoreModalHeader}>
            <Trophy color="#FFD700" size={24} /><Text style={styles.scoreModalTitle}>Game Standings</Text>
            <TouchableOpacity onPress={onClose}><X color="#FFF" size={24} /></TouchableOpacity>
          </View>
          <View style={styles.scoreStats}>
            <View style={styles.scoreRow}><Text style={styles.scoreLabel}>WHITE</Text><Text style={styles.scoreValue}>{score.whiteSets} Sets | {score.whitePoints} Pts</Text></View>
            <View style={styles.scoreRow}><Text style={styles.scoreLabel}>BLACK</Text><Text style={styles.scoreValue}>{score.blackSets} Sets | {score.blackPoints} Pts</Text></View>
          </View>
          {victoryInfo && (
            <View style={styles.victoryBox}><Text style={styles.victoryLabel}>Last Win</Text><Text style={styles.victoryType}>{victoryInfo.type}</Text></View>
          )}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}><Text style={styles.closeBtnText}>Back to Game</Text></TouchableOpacity>
          {!confirming ? (
            <TouchableOpacity style={styles.resetBtn} onPress={() => setConfirming(true)}>
              <Trophy color="#FF4500" size={16} />
              <Text style={styles.resetBtnText}>טורניר חדש</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.resetConfirmRow}>
              <TouchableOpacity
                style={[styles.resetConfirmBtn, styles.resetConfirmYes]}
                onPress={() => { setConfirming(false); onResetTournament(); onClose(); }}
              >
                <Text style={styles.resetConfirmText}>כן, אפס הכל</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resetConfirmBtn, styles.resetConfirmNo]}
                onPress={() => setConfirming(false)}
              >
                <Text style={styles.resetConfirmText}>ביטול</Text>
              </TouchableOpacity>
            </View>
          )}
        </MotiView>
      </Pressable>
    </Modal>
  );
};

const ChoiceOverlay63: React.FC<{ onChoice: (reRoll: boolean) => void }> = ({ onChoice }) => (
  <MotiView from={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'timing', duration: 300 }} style={styles.specialCard}>
    <Text style={styles.specialCardTitle}>רשות: להטיל שוב?</Text>
    <View style={styles.specialCardRow}>
      <TouchableOpacity style={styles.specialCardBtn} onPress={() => onChoice(false)}><Text style={styles.specialCardBtnText}>שחק 6:3</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.specialCardBtn, styles.specialCardBtnAlt]} onPress={() => onChoice(true)}><Text style={styles.specialCardBtnText}>הטל שוב</Text></TouchableOpacity>
    </View>
  </MotiView>
);

const SpecialRollCard: React.FC<{
  onAcknowledgeSkip?: () => void;
  onChoose63?: (reRoll: boolean) => void;
  onChooseDouble?: (value: number) => void;
  onConfirmSpecial?: () => void;
}> = ({ onAcknowledgeSkip, onChoose63, onChooseDouble, onConfirmSpecial }) => {
  const {
    phase, message, currentPlayer,
    acknowledgeSkip, choose63, chooseDouble, confirmSpecialResult,
  } = useGameStore();

  const ack = onAcknowledgeSkip || acknowledgeSkip;
  const ch63 = onChoose63 || choose63;
  const chDbl = onChooseDouble || chooseDouble;
  const cfm = onConfirmSpecial || confirmSpecialResult;

  // Mirror system alerts toward the active player: White (top) reads inverted.
  const mirroredStyle = currentPlayer === 1 ? { transform: [{ rotate: '180deg' as const }] } : undefined;

  if (phase === 'SPECIAL_CHOOSE_DOUBLE') {
    return (
      <View style={[styles.specialCardWrapper, mirroredStyle]}>
        <DoubleChooserPanel onChoose={chDbl} />
      </View>
    );
  }

  if (phase === 'SPECIAL_63_CHOICE') {
    return (
      <View style={[styles.specialCardWrapper, mirroredStyle]}>
        <ChoiceOverlay63 onChoice={ch63} />
      </View>
    );
  }

  if (phase === 'SKIP') {
    return (
      <View style={[styles.specialCardWrapper, mirroredStyle]}>
        <MotiView from={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'timing', duration: 300 }} style={styles.specialCard}>
          <View style={styles.specialCardRow}>
            <Text style={styles.specialCardTitle}>{message || 'תור עובר!'}</Text>
            <TouchableOpacity style={styles.specialCardBtn} onPress={ack}><Text style={styles.specialCardBtnText}>סבבה</Text></TouchableOpacity>
          </View>
        </MotiView>
      </View>
    );
  }

  if (phase === 'SPECIAL_43_RESULT' || phase === 'SPECIAL_51_RESULT') {
    return (
      <View style={[styles.specialCardWrapper, mirroredStyle]}>
        <MotiView from={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'timing', duration: 300 }} style={styles.specialCard}>
          <View style={styles.specialCardRow}>
            <Text style={styles.specialCardTitle}>{message}</Text>
            <TouchableOpacity style={styles.specialCardBtn} onPress={cfm}><Text style={styles.specialCardBtnText}>יאללה!</Text></TouchableOpacity>
          </View>
        </MotiView>
      </View>
    );
  }

  return null;
};

const InfoModal: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => (
  <Modal visible={visible} transparent animationType="fade">
    <Pressable style={styles.modalBackdrop} onPress={onClose}>
      <MotiView from={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={styles.infoModalContent}>
        <View style={styles.scoreModalHeader}>
          <Text style={styles.scoreModalTitle}>הוראות המשחק</Text>
          <TouchableOpacity onPress={onClose}><X color="#FFF" size={24} /></TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: 320 }}>
          <Text style={styles.infoText}>
            נשבש הוא משחק שש-בש עם חוקים מיוחדים.{'\n\n'}
            🎲 הטלות מיוחדות:{'\n'}
            • 1:2 — תור עובר{'\n'}
            • 4:5 — בחר איזה דאבל לשחק{'\n'}
            • 5:1 — הטל קובייה לקביעת דאבל{'\n'}
            • 5:2 — תזוזה אחורה{'\n'}
            • 4:3 — הטל קובייה לתזוזה אחורה{'\n'}
            • 6:3 — שחק או הטל מחדש{'\n'}
            • 6:5 — Nesh Strike!{'\n\n'}
            🔥 דאבל נותן תור נוסף{'\n'}
            💥 3 דאבלים רצופים = הפיכת שולחן
          </Text>
        </ScrollView>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}><Text style={styles.closeBtnText}>סגור</Text></TouchableOpacity>
      </MotiView>
    </Pressable>
  </Modal>
);

const BorneBadge: React.FC<{ count: number; isWhite: boolean }> = ({ count, isWhite }) => (
  <View style={[styles.borneBadge, isWhite ? styles.borneWhite : styles.borneBlack]}>
    <Text style={[styles.borneBadgeText, { color: isWhite ? '#1A0D05' : '#FFF' }]}>{count}</Text>
  </View>
);

const EatImpactFlash: React.FC<{ visible: boolean }> = ({ visible }) => {
  const opacity = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: 0.35, duration: 60, useNativeDriver: true }),
        RNAnimated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  return (
    <RNAnimated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FF4500', opacity, borderRadius: 8, zIndex: 100 }]}
    />
  );
};

// ── Refactored Game Content Components ──────────────────────────────────────
const BoardContent: React.FC<{
  isLandscape: boolean;
  boardAnimatedStyle: any;
  showEatFlash: boolean;
  lastThrowVelocity: number;
  boardWidth: number;
  onPointPressOverride?: (index: number) => void;
}> = ({ isLandscape, boardAnimatedStyle, showEatFlash, lastThrowVelocity, boardWidth, onPointPressOverride }) => {
  const {
    board, whiteBorneOff, blackBorneOff, selectedIndex,
    intermediateHighlights, finalHighlights, handlePointPress,
  } = useGameStore();

  const pointPress = onPointPressOverride || handlePointPress;

  return (
    <ReanimatedView.View style={[styles.boardWrapper, isLandscape && styles.boardWrapperLandscape, boardAnimatedStyle]}>
      <EatImpactFlash visible={showEatFlash} />

      <Board
        board={board} whiteBorneOff={whiteBorneOff} blackBorneOff={blackBorneOff}
        selectedIndex={selectedIndex} intermediateHighlights={intermediateHighlights}
        finalHighlights={finalHighlights} onPointPress={pointPress}
        boardWidth={boardWidth}
        showBearOffRow={isLandscape}
      />
      <ThrowingDiceOverlay velocity={lastThrowVelocity} />
    </ReanimatedView.View>
  );
};

const PlayerSidebar: React.FC<{
  playerSign: number;
}> = ({ playerSign }) => {
  const { currentPlayer, whiteBorneOff, blackBorneOff } = useGameStore();
  const isCurrent = currentPlayer === playerSign;
  const label = playerSign === 1 ? 'WHITE' : 'BLACK';
  const borneCount = playerSign === 1 ? whiteBorneOff : blackBorneOff;
  const isWhite = playerSign === 1;

  return (
    <View style={[styles.sidebar, !isCurrent && { opacity: 0.5 }]}>
      <View style={styles.sidebarContent}>
        <View style={[styles.sidebarPlayerCard, isCurrent && styles.activePlayerCard]}>
          <Text style={styles.statusLabel}>{label}</Text>
          <View style={styles.borneRow}>
            <BorneBadge count={borneCount} isWhite={isWhite} />
            <Text style={styles.borneCountLabel}>Off: {borneCount}/15</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

// Dice bar positioned above (White's turn) or below (Black's turn) the board in landscape.
const CenteredDiceBar: React.FC<{
  getStatusText: () => string;
  handleRoll: (v: number) => void;
  isSingleDiePhase: boolean;
  endTurnOverride?: () => void;
  dieSize: number;
}> = ({ getStatusText, handleRoll, isSingleDiePhase, endTurnOverride, dieSize }) => {
  const {
    currentPlayer, whiteBorneOff, blackBorneOff, phase, dice, availableDice,
    board, backward, endTurn,
  } = useGameStore();
  const end = endTurnOverride || endTurn;
  const isWhiteTurn = currentPlayer === 1;

  const noLegalMoves = phase === 'MOVING'
    && availableDice.length > 0
    && !currentPlayerHasLegalMoves({ board, currentPlayer, availableDice, backward });

  return (
    <MotiView
      key={currentPlayer}
      from={{ opacity: 0, translateY: isWhiteTurn ? -8 : 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 260 }}
      style={[
        styles.centeredDiceBar,
        isWhiteTurn ? styles.centeredDiceBarWhite : styles.centeredDiceBarBlack,
        isWhiteTurn && { transform: [{ rotate: '180deg' }] },
      ]}
    >
      <Text style={styles.centeredDiceStatus}>{getStatusText()}</Text>
      <View style={styles.centeredDicePanelWrapper}>
        <DicePanel
          rolledDice={dice} availableDice={availableDice}
          canRoll={phase === 'WAITING_ROLL' || phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL'}
          onRoll={handleRoll} currentPlayer={currentPlayer}
          whiteBorneOff={whiteBorneOff} blackBorneOff={blackBorneOff}
          singleDie={isSingleDiePhase}
          dieSize={dieSize}
        />
      </View>
      {noLegalMoves && (
        <TouchableOpacity style={styles.centeredEndBtn} onPress={end}>
          <Text style={styles.sidebarEndBtnText}>No moves · End Turn</Text>
        </TouchableOpacity>
      )}
    </MotiView>
  );
};

// ── Mirrored per-player dice bar (always visible on both sides) ─────────────
// `side === 'top'` (White) renders rotated 180° so text reads toward that
// player. Active side flashes subtle green when turn changes to it.
const PlayerDiceBar: React.FC<{
  side: 'top' | 'bottom';
  getStatusText: () => string;
  handleRoll: (v: number) => void;
  isSingleDiePhase: boolean;
  endTurnOverride?: () => void;
  dieSize: number;
}> = ({ side, getStatusText, handleRoll, isSingleDiePhase, endTurnOverride, dieSize }) => {
  const {
    currentPlayer, whiteBorneOff, blackBorneOff, phase, dice, availableDice,
    board, backward, endTurn,
  } = useGameStore();
  const end = endTurnOverride || endTurn;

  // Physical mapping: White (+1) sits at the top, Black (-1) at the bottom.
  // The top bar is rotated 180° so White reads their side right-side-up.
  const mySide: PlayerSign = side === 'top' ? 1 : -1;
  const isMyTurn = currentPlayer === mySide;
  const isMirrored = side === 'top';

  // Intelligent End Turn: only visible when the active player has no legal
  // moves left with their remaining dice. In all other cases, the dice drive
  // the turn forward naturally.
  const noLegalMoves = isMyTurn
    && phase === 'MOVING'
    && availableDice.length > 0
    && !currentPlayerHasLegalMoves({ board, currentPlayer, availableDice, backward });

  return (
    <MotiView
      from={{ borderColor: isMyTurn ? 'rgba(50,205,50,0.35)' : 'rgba(255,255,255,0.08)' }}
      animate={{ borderColor: isMyTurn ? 'rgba(50,205,50,0.85)' : 'rgba(255,255,255,0.08)' }}
      transition={{
        type: 'timing',
        duration: isMyTurn ? 1100 : 0,
        loop: isMyTurn,
        repeatReverse: true,
      }}
      style={[
        styles.playerBar,
        isMirrored && { transform: [{ rotate: '180deg' }] },
        !isMyTurn && styles.playerBarDim,
      ]}
    >
      {/* Turn-change green flash overlay (one-shot) */}
      {isMyTurn && (
        <MotiView
          key={`flash-${currentPlayer}`}
          from={{ opacity: 0.5 }}
          animate={{ opacity: 0 }}
          transition={{ type: 'timing', duration: 800 }}
          style={styles.playerBarFlash}
          pointerEvents="none"
        />
      )}

      <View style={styles.playerBarLeft}>
        <Text style={styles.playerBarLabel}>
          {mySide === 1 ? 'WHITE' : 'BLACK'}
        </Text>
        <Text style={styles.playerBarStatus} numberOfLines={1}>
          {isMyTurn ? getStatusText() : 'Waiting…'}
        </Text>
        <Text style={styles.playerBarBorneMini}>
          Off: {(mySide === 1 ? whiteBorneOff : blackBorneOff)}/15
        </Text>
      </View>

      <View style={styles.playerBarCenter}>
        {isMyTurn ? (
          <DicePanel
            rolledDice={dice} availableDice={availableDice}
            canRoll={phase === 'WAITING_ROLL' || phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL'}
            onRoll={handleRoll} currentPlayer={currentPlayer}
            whiteBorneOff={whiteBorneOff} blackBorneOff={blackBorneOff}
            singleDie={isSingleDiePhase}
            dieSize={dieSize}
          />
        ) : (
          <View style={styles.playerBarIdle}>
            <Text style={styles.playerBarIdleText}>— not your turn —</Text>
          </View>
        )}
      </View>

      <View style={styles.playerBarRight}>
        {noLegalMoves && (
          <TouchableOpacity style={styles.playerBarEndBtn} onPress={end}>
            <Text style={styles.playerBarEndBtnText}>No moves · End</Text>
          </TouchableOpacity>
        )}
      </View>
    </MotiView>
  );
};

// ── Hotseat opening-roll overlay (INITIAL_ROLL phase, single-device) ────────
const HotseatOpeningRollOverlay: React.FC = () => {
  const { openingWhiteDie, openingBlackDie, rollOpeningDie } = useGameStore();

  const isTie = openingWhiteDie != null && openingBlackDie != null && openingWhiteDie === openingBlackDie;
  const resolved = openingWhiteDie != null && openingBlackDie != null && !isTie;
  const winnerLabel = resolved
    ? (openingWhiteDie! > openingBlackDie! ? 'לבן' : 'שחור')
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.initialRollContainer}>
        <Text style={styles.initialRollTitle}>הטלת פתיחה</Text>
        <Text style={styles.initialRollSubtitle}>כל שחקן מטיל קובייה אחת — הגבוה מתחיל</Text>

        <View style={styles.initialRollDiceRow}>
          {/* White slot */}
          <View style={styles.initialRollSlot}>
            <Text style={styles.initialRollName}>לבן</Text>
            {openingWhiteDie != null ? (
              <MotiView
                key={`w-${openingWhiteDie}`}
                from={{ scale: 0, rotate: '180deg' }}
                animate={{ scale: 1, rotate: '0deg' }}
                transition={{ type: 'spring', damping: 12 }}
              >
                <DieFace value={openingWhiteDie} size={64} />
              </MotiView>
            ) : (
              <TouchableOpacity style={styles.initialRollBtn} onPress={() => rollOpeningDie(1)}>
                <Text style={styles.initialRollBtnText}>🎲 לחץ לזרוק</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.initialRollVs}>VS</Text>

          {/* Black slot */}
          <View style={styles.initialRollSlot}>
            <Text style={styles.initialRollName}>שחור</Text>
            {openingBlackDie != null ? (
              <MotiView
                key={`b-${openingBlackDie}`}
                from={{ scale: 0, rotate: '180deg' }}
                animate={{ scale: 1, rotate: '0deg' }}
                transition={{ type: 'spring', damping: 12 }}
              >
                <DieFace value={openingBlackDie} size={64} />
              </MotiView>
            ) : (
              <TouchableOpacity style={styles.initialRollBtn} onPress={() => rollOpeningDie(-1)}>
                <Text style={styles.initialRollBtnText}>🎲 לחץ לזרוק</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {isTie && (
          <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Text style={styles.initialRollResult}>תיקו! זורקים שוב...</Text>
          </MotiView>
        )}
        {resolved && winnerLabel && (
          <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
            <Text style={styles.initialRollResult}>{winnerLabel} מתחיל!</Text>
          </MotiView>
        )}
      </View>
    </SafeAreaView>
  );
};

// ── Initial Roll Overlay ────────────────────────────────────────────────────
const InitialRollOverlay: React.FC = () => {
  const { myDie, opponentDie, rollMyDie, playerName, opponentName, role } = useMultiplayerStore();
  const startWithDice = useGameStore((s) => s.startWithDice);
  const [resolving, setResolving] = useState(false);

  const myLabel = role === 'host' ? 'לבן' : 'שחור';
  const oppLabel = role === 'host' ? 'שחור' : 'לבן';

  // When both have rolled, resolve after a short delay
  useEffect(() => {
    if (myDie != null && opponentDie != null && !resolving) {
      setResolving(true);
      const timer = setTimeout(async () => {
        if (myDie === opponentDie) {
          // Tie — re-roll
          const { roomId } = useMultiplayerStore.getState();
          if (roomId) await clearInitialDice(roomId);
          useMultiplayerStore.setState({ myDie: null, opponentDie: null });
          setResolving(false);
          return;
        }

        const { role: r, roomId } = useMultiplayerStore.getState();
        // Host = White (+1), Guest = Black (-1)
        // Whoever rolled higher goes first
        const hostDie = r === 'host' ? myDie : opponentDie;
        const guestDie = r === 'host' ? opponentDie : myDie;
        const firstPlayer: PlayerSign = hostDie > guestDie ? 1 : -1;
        startWithDice(firstPlayer, hostDie, guestDie);
        useMultiplayerStore.setState({ screen: 'game' });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [myDie, opponentDie, resolving]);

  const resultText = myDie != null && opponentDie != null
    ? myDie === opponentDie
      ? 'תיקו! זורקים שוב...'
      : (myDie > opponentDie ? `${playerName} מתחיל!` : `${opponentName} מתחיל!`)
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.initialRollContainer}>
        <Text style={styles.initialRollTitle}>הטלת פתיחה</Text>
        <Text style={styles.initialRollSubtitle}>כל שחקן מטיל קובייה אחת — הגבוה מתחיל</Text>

        <View style={styles.initialRollDiceRow}>
          {/* My die */}
          <View style={styles.initialRollSlot}>
            <Text style={styles.initialRollName}>{playerName} ({myLabel})</Text>
            {myDie != null ? (
              <MotiView from={{ scale: 0, rotate: '180deg' }} animate={{ scale: 1, rotate: '0deg' }} transition={{ type: 'spring', damping: 12 }}>
                <DieFace value={myDie} size={64} />
              </MotiView>
            ) : (
              <TouchableOpacity style={styles.initialRollBtn} onPress={() => rollMyDie()}>
                <Text style={styles.initialRollBtnText}>🎲 לחץ לזרוק</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.initialRollVs}>VS</Text>

          {/* Opponent die */}
          <View style={styles.initialRollSlot}>
            <Text style={styles.initialRollName}>{opponentName} ({oppLabel})</Text>
            {opponentDie != null ? (
              <MotiView from={{ scale: 0, rotate: '180deg' }} animate={{ scale: 1, rotate: '0deg' }} transition={{ type: 'spring', damping: 12 }}>
                <DieFace value={opponentDie} size={64} />
              </MotiView>
            ) : (
              <View style={styles.initialRollWaiting}>
                <Text style={styles.initialRollWaitText}>ממתין...</Text>
              </View>
            )}
          </View>
        </View>

        {resultText && (
          <MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>
            <Text style={styles.initialRollResult}>{resultText}</Text>
          </MotiView>
        )}
      </View>
    </SafeAreaView>
  );
};

// ── Main App Component ──────────────────────────────────────────────────────
export default function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // ── Fixed-proportion board sizing (same ratio every device) ─────────────────
  // BOARD_ASPECT = 1.52 → boardHeight = boardWidth / 1.52
  // Chrome budget: header + legend + dice bars + safe areas.
  //   portrait: ~320px of chrome   |   landscape: ~200px of chrome
  const chromeH = isLandscape ? 200 : 320;
  const sideChromeW = isLandscape ? 260 : 12;   // sidebars in landscape
  const availW = width - sideChromeW;
  const availH = height - chromeH;
  // Board total height ≈ boardWidth/1.52 + bear-off row (~40)
  const fromH = (availH - 40) * BOARD_ASPECT;
  const boardWidth = Math.max(280, Math.min(availW, fromH));

  // Derive checker diameter from board width using the frozen ratios, and lock
  // die size to ~0.6x of the checker — comfortably within the 0.5–0.66 band.
  const innerBoardWidth = boardWidth - 16;
  const barW = innerBoardWidth * BOARD_FROZEN.BAR_WIDTH_RATIO;
  const slotW = (innerBoardWidth - barW) / 12;
  const checkerDiameter = Math.round(slotW * BOARD_FROZEN.PIECE_SLOT_RATIO);
  // Hard-locked at 0.6x of checker diameter (within the 0.5–0.66 band).
  // Significantly smaller than before, never touches the surrounding borders.
  const dieSize = Math.max(14, Math.round(checkerDiameter * 0.6));

  // ── Multiplayer screen routing ──────────────────────────────────────────
  const mpScreen = useMultiplayerStore((s) => s.screen);
  const mpRole = useMultiplayerStore((s) => s.role);
  const mpRoomId = useMultiplayerStore((s) => s.roomId);
  const mpIsMultiplayer = useMultiplayerStore((s) => s.isMultiplayer);

  const {
    phase, dice, availableDice, doublesCount, currentPlayer,
    whiteBorneOff, blackBorneOff,
    score, message, victoryInfo, rollDice, rollSingleDie, endTurn,
    handlePointPress, board, startWithDice, startNewGame,
  } = useGameStore();

  const audio = useAudioManager();
  const { boardAnimatedStyle, triggerFlip } = useTableFlipAnimation();
  const prevPhaseRef = useRef(phase);
  const prevMessageRef = useRef(message);
  const prevDiceRef = useRef(dice);
  const [showEatFlash, setShowEatFlash] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [lastThrowVelocity, setLastThrowVelocity] = useState(0);

  // ── Multiplayer sync: host pushes state, processes guest actions ─────────
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Host: sync game state to Firebase on every relevant change
  useEffect(() => {
    if (!mpIsMultiplayer || mpRole !== 'host' || !mpRoomId) return;
    if (mpScreen !== 'game') return;

    // Debounce sync to avoid excessive writes
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      const gs = useGameStore.getState();
      syncGameState(mpRoomId, {
        board: gs.board,
        phase: gs.phase,
        dice: gs.dice,
        availableDice: gs.availableDice,
        currentPlayer: gs.currentPlayer,
        whiteBorneOff: gs.whiteBorneOff,
        blackBorneOff: gs.blackBorneOff,
        doublesCount: gs.doublesCount,
        message: gs.message,
        score: gs.score,
        victoryInfo: gs.victoryInfo,
        selectedIndex: gs.selectedIndex,
        intermediateHighlights: gs.intermediateHighlights,
        finalHighlights: gs.finalHighlights,
        backward: gs.backward,
        extraTurn: gs.extraTurn,
      });
    }, 100);
  }, [phase, dice, availableDice, currentPlayer, board, whiteBorneOff, blackBorneOff, message, mpScreen]);

  // Host: listen for guest actions
  useEffect(() => {
    if (!mpIsMultiplayer || mpRole !== 'host' || !mpRoomId) return;
    if (mpScreen !== 'game') return;

    const unsub = subscribeToActions(mpRoomId, async (action) => {
      if (!action) return;
      const gs = useGameStore.getState();
      
      switch (action.type) {
        case 'ROLL_DICE':
          gs.rollDice();
          break;
        case 'ROLL_SINGLE_DIE':
          gs.rollSingleDie();
          break;
        case 'POINT_PRESS':
          gs.handlePointPress(action.payload?.index);
          break;
        case 'END_TURN':
          gs.endTurn();
          break;
        case 'ACKNOWLEDGE_SKIP':
          gs.acknowledgeSkip();
          break;
        case 'CHOOSE_63':
          gs.choose63(action.payload?.reRoll);
          break;
        case 'CHOOSE_DOUBLE':
          gs.chooseDouble(action.payload?.value);
          break;
        case 'CONFIRM_SPECIAL':
          gs.confirmSpecialResult();
          break;
      }

      await clearPendingAction(mpRoomId);
    });

    return () => unsub();
  }, [mpIsMultiplayer, mpRole, mpRoomId, mpScreen]);

  // Guest: subscribe to game state from Firebase
  useEffect(() => {
    if (!mpIsMultiplayer || mpRole !== 'guest' || !mpRoomId) return;
    if (mpScreen !== 'game') return;

    const unsub = subscribeToGameState(mpRoomId, (state) => {
      if (!state) return;
      useGameStore.setState({
        board: state.board,
        phase: state.phase,
        dice: state.dice,
        availableDice: state.availableDice,
        currentPlayer: state.currentPlayer,
        whiteBorneOff: state.whiteBorneOff,
        blackBorneOff: state.blackBorneOff,
        doublesCount: state.doublesCount,
        message: state.message,
        score: state.score,
        victoryInfo: state.victoryInfo,
        selectedIndex: state.selectedIndex,
        intermediateHighlights: state.intermediateHighlights,
        finalHighlights: state.finalHighlights,
        backward: state.backward,
        extraTurn: state.extraTurn,
      });
    });

    return () => unsub();
  }, [mpIsMultiplayer, mpRole, mpRoomId, mpScreen]);

  useEffect(() => {
    if (dice && (!prevDiceRef.current || dice[0] !== prevDiceRef.current[0] || dice[1] !== prevDiceRef.current[1])) {
       audio.playRollDice();
    }
    if (phase === 'TABLE_FLIP' && prevPhaseRef.current !== 'TABLE_FLIP') {
      audio.playTableFlip();
      triggerFlip();
    }
    if (message && message.includes('Captured') && message !== prevMessageRef.current) {
      audio.playEatPiece();
      setShowEatFlash(true);
      setTimeout(() => setShowEatFlash(false), 400);
    }
    if (message !== prevMessageRef.current && phase === 'MOVING' && message && !message.includes('Captured')) {
      audio.playMovePiece();
    }
    prevPhaseRef.current = phase;
    prevMessageRef.current = message;
    prevDiceRef.current = dice;
  }, [phase, message, dice]);

  // ── Guest action relay: send actions to Firebase instead of local ────────
  const isGuest = mpIsMultiplayer && mpRole === 'guest';
  const guestMySign: PlayerSign = mpRole === 'host' ? 1 : -1;

  const sendAction = useCallback(async (action: { type: string; payload?: any }) => {
    if (isGuest && mpRoomId) await sendGuestAction(mpRoomId, action);
  }, [isGuest, mpRoomId]);

  // Check if it's the local player's turn in multiplayer
  const isMyTurn = !mpIsMultiplayer || currentPlayer === guestMySign;

  const isSingleDiePhase = phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL'
    || phase === 'SPECIAL_43_RESULT';

  const handleRoll = (v: number) => {
    if (mpIsMultiplayer && !isMyTurn) return;
    setLastThrowVelocity(v);
    if (isGuest) {
      if (phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL') {
        sendAction({ type: 'ROLL_SINGLE_DIE' });
      } else {
        sendAction({ type: 'ROLL_DICE' });
      }
    } else {
      if (phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL') {
        rollSingleDie();
      } else {
        rollDice();
      }
    }
  };

  // Guest override functions for multiplayer relay
  const guestPointPress = isGuest ? (index: number) => sendAction({ type: 'POINT_PRESS', payload: { index } }) : undefined;
  const guestEndTurn = isGuest ? () => sendAction({ type: 'END_TURN' }) : undefined;
  const guestAckSkip = isGuest ? () => sendAction({ type: 'ACKNOWLEDGE_SKIP' }) : undefined;
  const guestChoose63 = isGuest ? (reRoll: boolean) => sendAction({ type: 'CHOOSE_63', payload: { reRoll } }) : undefined;
  const guestChooseDouble = isGuest ? (value: number) => sendAction({ type: 'CHOOSE_DOUBLE', payload: { value } }) : undefined;
  const guestConfirmSpecial = isGuest ? () => sendAction({ type: 'CONFIRM_SPECIAL' }) : undefined;
  const wrappedEndTurn = guestEndTurn || endTurn;

  // ── Screen routing ──────────────────────────────────────────────────────
  if (mpScreen === 'lobby') return <LobbyScreen />;
  if (mpScreen === 'initialRoll') return <InitialRollOverlay />;
  // Hotseat: single-device opening roll before each game begins.
  if (phase === 'INITIAL_ROLL' && !mpIsMultiplayer) return <HotseatOpeningRollOverlay />;

  const isMoving = phase === 'MOVING';
  const playerLabel = currentPlayer === 1 ? 'White' : 'Black';

  const getStatusText = () => {
    if (phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL') return 'זרוק קובייה — להמשך המהלך';
    if (phase === 'MOVING') {
      if (availableDice.length === 0) return 'Turn ending...';
      return `Rolls: (${availableDice.join(', ')})`;
    }
    if (phase === 'SPECIAL_NESH_STRIKE_FREE_MOVE') return `NESH STRIKE!`;
    if (phase === 'WAITING_ROLL') return `Swipe to throw!`;
    return '';
  };

  const renderLogo = () => (
    <View style={styles.logoRow}>
      <Text style={styles.titleNesh}>Nesh</Text>
      <Text style={styles.titleBesh}>Besh</Text>
    </View>
  );

  const renderHeaderActions = () => (
    <View style={styles.headerActions}>
      {doublesCount > 0 && (
        <View style={styles.doublesBadge}><Text style={styles.doublesBadgeText}>🔥 {doublesCount}</Text></View>
      )}
      <TouchableOpacity style={styles.scoreIconBtn} onPress={() => setShowScoreModal(true)}><Trophy color="#FFD700" size={20} /></TouchableOpacity>
    </View>
  );

  if (isLandscape) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.landscapeHeader}>
          {renderLogo()}
          {renderHeaderActions()}
        </View>
        <View style={styles.landscapeRow}>
          <PlayerSidebar playerSign={-1} />
          <View style={styles.centerStage}>
            {currentPlayer === 1 && (
              <CenteredDiceBar
                getStatusText={getStatusText} handleRoll={handleRoll}
                isSingleDiePhase={isSingleDiePhase} endTurnOverride={guestEndTurn}
                dieSize={dieSize}
              />
            )}
            <BoardContent
              isLandscape={true} boardAnimatedStyle={boardAnimatedStyle}
              showEatFlash={showEatFlash} lastThrowVelocity={lastThrowVelocity}
              boardWidth={boardWidth}
              onPointPressOverride={guestPointPress}
            />
            {currentPlayer === -1 && (
              <CenteredDiceBar
                getStatusText={getStatusText} handleRoll={handleRoll}
                isSingleDiePhase={isSingleDiePhase} endTurnOverride={guestEndTurn}
                dieSize={dieSize}
              />
            )}
            <SpecialRollCard
              onAcknowledgeSkip={guestAckSkip} onChoose63={guestChoose63}
              onChooseDouble={guestChooseDouble} onConfirmSpecial={guestConfirmSpecial}
            />
          </View>
          <PlayerSidebar playerSign={1} />
        </View>
        <ScoreModal visible={showScoreModal} onClose={() => setShowScoreModal(false)} score={score} victoryInfo={victoryInfo} onResetTournament={startNewGame} />
        <SpecialRollOverlay />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setShowInfoModal(true)}>
            <Info color="#FFD700" size={18} />
          </TouchableOpacity>
          <BorneBadge count={whiteBorneOff} isWhite={true} />
        </View>
        <View style={styles.headerCenter}>
          <View style={styles.logoRow}>
            <Text style={styles.titleNesh}>Nesh</Text>
            <Text style={styles.titleBesh}>Besh</Text>
          </View>
          {doublesCount > 0 && (
            <View style={styles.doublesBadge}><Text style={styles.doublesBadgeText}>🔥 {doublesCount}</Text></View>
          )}
        </View>
        <View style={[styles.headerSide, { justifyContent: 'flex-end' }]}>
          <BorneBadge count={blackBorneOff} isWhite={false} />
          <TouchableOpacity style={styles.headerBtn} onPress={() => setShowScoreModal(true)}>
            <Trophy color="#FFD700" size={18} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.mainContent}>
        {/* White player's dice bar — top, 180° rotated so text reads upward */}
        <PlayerDiceBar
          side="top" getStatusText={getStatusText} handleRoll={handleRoll}
          isSingleDiePhase={isSingleDiePhase} endTurnOverride={guestEndTurn}
          dieSize={dieSize}
        />

        <View style={{ width: boardWidth, alignSelf: 'center' }}>
          <BoardContent
            isLandscape={false} boardAnimatedStyle={boardAnimatedStyle}
            showEatFlash={showEatFlash} lastThrowVelocity={lastThrowVelocity}
            boardWidth={boardWidth}
            onPointPressOverride={guestPointPress}
          />
        </View>

        {/* Black player's dice bar — bottom, normal orientation */}
        <PlayerDiceBar
          side="bottom" getStatusText={getStatusText} handleRoll={handleRoll}
          isSingleDiePhase={isSingleDiePhase} endTurnOverride={guestEndTurn}
          dieSize={dieSize}
        />

        <SpecialRollCard
          onAcknowledgeSkip={guestAckSkip} onChoose63={guestChoose63}
          onChooseDouble={guestChooseDouble} onConfirmSpecial={guestConfirmSpecial}
        />
      </View>
      <ScoreModal visible={showScoreModal} onClose={() => setShowScoreModal(false)} score={score} victoryInfo={victoryInfo} onResetTournament={startNewGame} />
      <InfoModal visible={showInfoModal} onClose={() => setShowInfoModal(false)} />
      <SpecialRollOverlay />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0705' },
  header: { paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  headerSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerCenter: { alignItems: 'center', paddingHorizontal: 4 },
  headerBtn: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  logoRow: { flexDirection: 'row' },
  titleNesh: { fontSize: 20, fontWeight: '900', color: '#007AFF', letterSpacing: 1 },
  titleBesh: { fontSize: 20, fontWeight: '900', color: '#32CD32', letterSpacing: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreIconBtn: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  doublesBadge: { backgroundColor: 'rgba(255, 69, 0, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FF4500', marginTop: 2 },
  doublesBadgeText: { color: '#FF4500', fontWeight: 'bold', fontSize: 10 },
  statusContainer: { paddingVertical: 8, alignItems: 'center' },
  status: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600', fontStyle: 'italic' },
  mainContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 4 },
  boardWrapper: { width: '100%', position: 'relative' },
  boardWrapperLandscape: { width: '92%', aspectRatio: 1.5, alignSelf: 'center' },
  borneContainerBottom: { position: 'absolute', bottom: -35, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, zIndex: 10 },
  borneBadge: { width: 26, height: 26, borderRadius: 6, justifyContent: 'center', alignItems: 'center', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 3, elevation: 5 },
  borneWhite: { backgroundColor: '#FFFFFF', borderColor: '#CCC' },
  borneBlack: { backgroundColor: '#2A2A2A', borderColor: '#444' },
  borneBadgeText: { fontWeight: '900', fontSize: 13 },
  compactLegend: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 8, minHeight: 24 },
  lenItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lenDot: { width: 8, height: 8, borderRadius: 4 },
  lenText: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  smallEndBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  smallEndBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700' },
  footer: { paddingBottom: 10 },
  
  // Landscape Styles
  landscapeHeader: { paddingHorizontal: 20, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  landscapeRow: { flex: 1, flexDirection: 'row', paddingHorizontal: 10 },
  sidebar: { width: '18%', justifyContent: 'flex-start', paddingTop: 20 },
  sidebarContent: { gap: 15, alignItems: 'center' },
  sidebarPlayerCard: { width: '90%', padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  activePlayerCard: { borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.05)' },
  borneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  borneCountLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 'bold' },
  centerStage: { flex: 1, justifyContent: 'center' },
  statusLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 'bold' },
  landscapeStatus: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 5 },
  sidebarDiceWrapper: { width: '100%', marginTop: 10 },
  sidebarEndBtn: { marginTop: 15, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: 'rgba(255,69,0,0.1)', borderWidth: 1, borderColor: '#FF4500' },
  sidebarEndBtnText: { color: '#FF4500', fontWeight: 'bold', fontSize: 12 },

  // ── Centered dice bar (landscape — above/below board based on turn) ─────────
  centeredDiceBar: {
    alignSelf: 'center',
    width: '60%',
    maxWidth: 420,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
  },
  centeredDiceBarWhite: {
    borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 6,
  },
  centeredDiceBarBlack: {
    borderColor: 'rgba(255,215,0,0.35)',
    marginTop: 6,
  },
  centeredDiceStatus: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  centeredDicePanelWrapper: {
    width: '100%',
  },
  centeredEndBtn: {
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(255,69,0,0.1)',
    borderWidth: 1,
    borderColor: '#FF4500',
  },

  // ── Portrait per-player dice bar (mirrored top / normal bottom) ─────────────
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginHorizontal: 6,
    marginVertical: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 8,
    overflow: 'hidden',
  },
  playerBarFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(50,205,50,0.28)',
    borderRadius: 14,
  },
  playerBarDim: {
    opacity: 0.45,
  },
  playerBarLeft: {
    width: 74,
    alignItems: 'flex-start',
  },
  playerBarLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  playerBarStatus: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontStyle: 'italic',
    marginTop: 2,
  },
  playerBarBorneMini: {
    color: '#FFD700',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  playerBarCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 70,
  },
  playerBarRight: {
    width: 74,
    alignItems: 'flex-end',
    gap: 4,
  },
  playerBarIdle: {
    opacity: 0.4,
    paddingVertical: 20,
  },
  playerBarIdleText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontStyle: 'italic',
  },
  playerBarEndBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,69,0,0.12)',
    borderWidth: 1,
    borderColor: '#FF4500',
  },
  playerBarEndBtnText: {
    color: '#FF4500',
    fontSize: 10,
    fontWeight: '900',
  },

  // ── Reset tournament button (ScoreModal) ────────────────────────────────────
  resetBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,69,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,69,0,0.4)',
  },
  resetBtnText: { color: '#FF4500', fontWeight: 'bold', fontSize: 14 },
  resetConfirmRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  resetConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  resetConfirmYes: {
    backgroundColor: 'rgba(255,69,0,0.2)',
    borderColor: '#FF4500',
  },
  resetConfirmNo: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  resetConfirmText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  scoreModalContent: { backgroundColor: '#1A110E', width: '100%', maxWidth: 400, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)' },
  scoreModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  scoreModalTitle: { flex: 1, fontSize: 18, color: '#FFF', fontWeight: 'bold' },
  scoreStats: { gap: 16, marginBottom: 24 },
  scoreRow: { backgroundColor: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreLabel: { color: 'rgba(255,255,255,0.5)', fontWeight: '800', fontSize: 12 },
  scoreValue: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  victoryBox: { backgroundColor: 'rgba(255,215,0,0.05)', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,215,0,0.1)' },
  victoryLabel: { color: '#FFD700', fontSize: 10, fontWeight: 'bold', marginBottom: 4 },
  victoryType: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  closeBtn: { backgroundColor: '#3E2210', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  choiceOverlayContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  choiceCard: { backgroundColor: 'rgba(26, 13, 5, 0.95)', padding: 20, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255, 215, 0, 0.4)', alignItems: 'center', gap: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.6, shadowRadius: 12, elevation: 15 },
  choiceTitle: { color: '#FFD700', fontSize: 17, fontWeight: '900', letterSpacing: 1 },
  choiceButtons: { flexDirection: 'row', gap: 10 },
  choiceBtn: { backgroundColor: '#7B3F20', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, minWidth: 100, alignItems: 'center' },
  choiceBtnSecondary: { backgroundColor: '#3E2210' },
  choiceBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  doubleButtons: { flexDirection: 'row', gap: 25, marginTop: 5 },
  doubleDieBtn: { alignItems: 'center', gap: 8 },
  doubleDieLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 'bold' },
  specialCard: { backgroundColor: 'rgba(26, 13, 5, 0.95)', borderRadius: 15, padding: 16, borderWidth: 1, borderColor: 'rgba(255, 215, 0, 0.4)', alignItems: 'center' as const, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 12 },
  specialCardWrapper: { paddingHorizontal: 16, paddingVertical: 4 },
  specialCardRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 14 },
  specialCardTitle: { color: '#FFD700', fontSize: 17, fontWeight: '900' as const, letterSpacing: 0.5 },
  specialCardBtn: { backgroundColor: '#7B3F20', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center' as const },
  specialCardBtnAlt: { backgroundColor: '#3E2210' },
  specialCardBtnText: { color: '#FFF', fontWeight: 'bold' as const, fontSize: 14 },
  infoModalContent: { backgroundColor: '#1A110E', width: '100%', maxWidth: 400, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)' },
  infoText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 22 },

  // ── Initial Roll Overlay ──────────────────────────────────────────────────
  initialRollContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  initialRollTitle: { color: '#FFD700', fontSize: 28, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  initialRollSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 40, textAlign: 'center' },
  initialRollDiceRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  initialRollSlot: { alignItems: 'center', gap: 12, minWidth: 100 },
  initialRollName: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  initialRollBtn: { backgroundColor: '#7B3F20', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: '#FFD700' },
  initialRollBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  initialRollVs: { color: 'rgba(255,255,255,0.3)', fontSize: 20, fontWeight: '900' },
  initialRollWaiting: { width: 64, height: 64, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  initialRollWaitText: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  initialRollResult: { color: '#FFD700', fontSize: 22, fontWeight: '900', marginTop: 40, textAlign: 'center' },
});
