import React, { useEffect, useRef, useState } from 'react';
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
import { useGameStore } from './src/store/useGameStore';
import { Board } from './src/components/Board';
import { DicePanel, DieFace } from './src/components/DicePanel';
import { DoubleChooserPanel } from './src/components/DoubleChooserPanel';
import { SpecialRollOverlay } from './src/components/SpecialRollOverlay';
import { ThrowingDiceOverlay } from './src/components/ThrowingDiceOverlay';
import { useTableFlipAnimation } from './src/animations';
import { useAudioManager } from './src/audio/useAudioManager';

// ... (ScoreModal, ChoiceOverlay, DoubleChoiceOverlay, BorneBadge, EatImpactFlash remain same)
// ── Score Modal ─────────────────────────────────────────────────────────────
const ScoreModal: React.FC<{ visible: boolean; onClose: () => void; score: any; victoryInfo: any; }> = ({ visible, onClose, score, victoryInfo }) => (
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
      </MotiView>
    </Pressable>
  </Modal>
);

const ChoiceOverlay63: React.FC<{ onChoice: (reRoll: boolean) => void }> = ({ onChoice }) => (
  <MotiView from={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'timing', duration: 300 }} style={styles.specialCard}>
    <Text style={styles.specialCardTitle}>רשות: להטיל שוב?</Text>
    <View style={styles.specialCardRow}>
      <TouchableOpacity style={styles.specialCardBtn} onPress={() => onChoice(false)}><Text style={styles.specialCardBtnText}>שחק 6:3</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.specialCardBtn, styles.specialCardBtnAlt]} onPress={() => onChoice(true)}><Text style={styles.specialCardBtnText}>הטל שוב</Text></TouchableOpacity>
    </View>
  </MotiView>
);

const SpecialRollCard: React.FC = () => {
  const {
    phase, message,
    acknowledgeSkip, choose63, chooseDouble, confirmSpecialResult,
  } = useGameStore();

  if (phase === 'SPECIAL_CHOOSE_DOUBLE') {
    return (
      <View style={styles.specialCardWrapper}>
        <DoubleChooserPanel onChoose={chooseDouble} />
      </View>
    );
  }

  if (phase === 'SPECIAL_63_CHOICE') {
    return (
      <View style={styles.specialCardWrapper}>
        <ChoiceOverlay63 onChoice={choose63} />
      </View>
    );
  }

  if (phase === 'SKIP') {
    return (
      <View style={styles.specialCardWrapper}>
        <MotiView from={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'timing', duration: 300 }} style={styles.specialCard}>
          <View style={styles.specialCardRow}>
            <Text style={styles.specialCardTitle}>תור עובר!</Text>
            <TouchableOpacity style={styles.specialCardBtn} onPress={acknowledgeSkip}><Text style={styles.specialCardBtnText}>סבבה</Text></TouchableOpacity>
          </View>
        </MotiView>
      </View>
    );
  }

  if (phase === 'SPECIAL_43_RESULT' || phase === 'SPECIAL_51_RESULT') {
    return (
      <View style={styles.specialCardWrapper}>
        <MotiView from={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'timing', duration: 300 }} style={styles.specialCard}>
          <View style={styles.specialCardRow}>
            <Text style={styles.specialCardTitle}>{message}</Text>
            <TouchableOpacity style={styles.specialCardBtn} onPress={confirmSpecialResult}><Text style={styles.specialCardBtnText}>יאללה!</Text></TouchableOpacity>
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
}> = ({ isLandscape, boardAnimatedStyle, showEatFlash, lastThrowVelocity }) => {
  const {
    board, whiteBorneOff, blackBorneOff, selectedIndex,
    intermediateHighlights, finalHighlights, handlePointPress,
  } = useGameStore();

  return (
    <ReanimatedView.View style={[styles.boardWrapper, isLandscape && styles.boardWrapperLandscape, boardAnimatedStyle]}>
      <EatImpactFlash visible={showEatFlash} />
      
      <Board
        board={board} whiteBorneOff={whiteBorneOff} blackBorneOff={blackBorneOff}
        selectedIndex={selectedIndex} intermediateHighlights={intermediateHighlights}
        finalHighlights={finalHighlights} onPointPress={handlePointPress}
      />
      <ThrowingDiceOverlay velocity={lastThrowVelocity} />
    </ReanimatedView.View>
  );
};

const PlayerSidebar: React.FC<{
  playerSign: number;
  getStatusText: () => string;
  handleRoll: (v: number) => void;
  isSingleDiePhase: boolean;
}> = ({ playerSign, getStatusText, handleRoll, isSingleDiePhase }) => {
  const {
    currentPlayer, whiteBorneOff, blackBorneOff, phase, dice, availableDice, endTurn,
  } = useGameStore();

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
        
        {isCurrent && (
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }}>
            <Text style={styles.landscapeStatus}>{getStatusText()}</Text>
            <View style={styles.sidebarDiceWrapper}>
              <DicePanel
                rolledDice={dice} availableDice={availableDice} 
                canRoll={phase === 'WAITING_ROLL' || phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL'}
                onRoll={handleRoll} currentPlayer={currentPlayer}
                whiteBorneOff={whiteBorneOff} blackBorneOff={blackBorneOff}
                singleDie={isSingleDiePhase}
              />
            </View>
          </MotiView>
        )}

        {isCurrent && phase === 'MOVING' && availableDice.length > 0 && (
          <TouchableOpacity style={styles.sidebarEndBtn} onPress={endTurn}>
            <Text style={styles.sidebarEndBtnText}>End Turn</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ── Main App Component ──────────────────────────────────────────────────────
export default function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Responsive board sizing for all Apple devices (iPhone 12–17, iPad 5–Pro M4).
  // Board total height ≈ boardWidth × 1.25 (wood aspect 0.82 + frame + bear-off).
  // Chrome overhead: header ~46 + legend ~32 + footer ~120 + safe areas ~80 ≈ 280.
  const boardMaxWidth = Math.min(width - 8, (height - 280) / 1.25);

  const {
    phase, dice, availableDice, doublesCount, currentPlayer,
    whiteBorneOff, blackBorneOff,
    score, message, victoryInfo, rollDice, rollSingleDie, endTurn,
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

  const isSingleDiePhase = phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL'
    || phase === 'SPECIAL_43_RESULT' || phase === 'SPECIAL_51_RESULT';

  const handleRoll = (v: number) => {
    setLastThrowVelocity(v);
    if (phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL') {
      rollSingleDie();
    } else {
      rollDice();
    }
  };

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
          <PlayerSidebar
            playerSign={-1} getStatusText={getStatusText}
            handleRoll={handleRoll} isSingleDiePhase={isSingleDiePhase}
          />
          <View style={styles.centerStage}>
            <BoardContent
              isLandscape={true} boardAnimatedStyle={boardAnimatedStyle}
              showEatFlash={showEatFlash} lastThrowVelocity={lastThrowVelocity}
            />
            <SpecialRollCard />
          </View>
          <PlayerSidebar
            playerSign={1} getStatusText={getStatusText}
            handleRoll={handleRoll} isSingleDiePhase={isSingleDiePhase}
          />
        </View>
        <ScoreModal visible={showScoreModal} onClose={() => setShowScoreModal(false)} score={score} victoryInfo={victoryInfo} />
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
        <View style={{ width: '100%', maxWidth: boardMaxWidth, alignSelf: 'center' }}>
          <BoardContent
            isLandscape={false} boardAnimatedStyle={boardAnimatedStyle}
            showEatFlash={showEatFlash} lastThrowVelocity={lastThrowVelocity}
          />
        </View>
        <View style={styles.compactLegend}>
          {isMoving && (
            <>
              <View style={styles.lenItem}><View style={[styles.lenDot, { backgroundColor: '#1E90FF' }]} /><Text style={styles.lenText}>Step</Text></View>
              <View style={styles.lenItem}><View style={[styles.lenDot, { backgroundColor: '#32CD32' }]} /><Text style={styles.lenText}>Target</Text></View>
            </>
          )}
          {isMoving && availableDice.length > 0 && (
            <TouchableOpacity style={styles.smallEndBtn} onPress={endTurn}><Text style={styles.smallEndBtnText}>End Turn</Text></TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.footer}>
        <DicePanel
          rolledDice={dice} availableDice={availableDice} 
          canRoll={phase === 'WAITING_ROLL' || phase === 'SPECIAL_43_ROLL' || phase === 'SPECIAL_51_ROLL'}
          onRoll={handleRoll} currentPlayer={currentPlayer}
          whiteBorneOff={0} blackBorneOff={0}
          singleDie={isSingleDiePhase}
        />
        <SpecialRollCard />
        <View style={styles.statusContainer}><Text style={styles.status}>{getStatusText()}</Text></View>
      </View>
      <ScoreModal visible={showScoreModal} onClose={() => setShowScoreModal(false)} score={score} victoryInfo={victoryInfo} />
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
});
