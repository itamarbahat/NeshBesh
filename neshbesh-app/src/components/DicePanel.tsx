import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, PanResponder, Dimensions, Animated as RNAnimated, TouchableOpacity } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Die Face Component ────────────────────────────────────────────────────────
interface DieFaceProps {
  value: number;
  used?: boolean;
  size?: number;
}

export const DieFace: React.FC<DieFaceProps> = ({ value, used = false, size = 44 }) => {
  const dotSize = size * 0.18;
  const dotColor = used ? '#666' : '#0047AB'; // Deep blue dots
  
  const renderDots = () => {
    const positions = {
      1: [[50, 50]],
      2: [[25, 25], [75, 75]],
      3: [[25, 25], [50, 50], [75, 75]],
      4: [[25, 25], [25, 75], [75, 25], [75, 75]],
      5: [[25, 25], [25, 75], [50, 50], [75, 25], [75, 75]],
      6: [[25, 25], [25, 50], [25, 75], [75, 25], [75, 50], [75, 75]]
    };
    const currentPos = positions[value as keyof typeof positions] || [];
    return currentPos.map(([x, y], i) => (
      <View
        key={i}
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: dotColor,
          marginLeft: -dotSize / 2,
          marginTop: -dotSize / 2,
        }}
      />
    ));
  };

  return (
    <View
      style={[
        styles.dieFace,
        {
          width: size,
          height: size,
          backgroundColor: '#FFFFFF',
          borderColor: '#E0E0E0',
          borderWidth: 1.5,
          borderRadius: size * 0.18,
          opacity: used ? 0.4 : 1,
        },
      ]}
    >
      {renderDots()}
    </View>
  );
};

// ── Dice Panel Component ──────────────────────────────────────────────────────
interface DicePanelProps {
  rolledDice: [number, number] | null;
  availableDice: number[];
  canRoll: boolean;
  onRoll: (velocity: number) => void;
  currentPlayer: 1 | -1;
  whiteBorneOff: number;
  blackBorneOff: number;
  singleDie?: boolean;
}

export const DicePanel: React.FC<DicePanelProps> = ({
  rolledDice,
  availableDice,
  canRoll,
  onRoll,
  singleDie = false,
}) => {
  const pan = useRef(new RNAnimated.ValueXY()).current;
  const [isSwiping, setIsSwiping] = useState(false);
  const [showResult, setShowResult] = useState(false);

  // Use refs to avoid stale closures in PanResponder
  const canRollRef = useRef(canRoll);
  const onRollRef = useRef(onRoll);
  canRollRef.current = canRoll;
  onRollRef.current = onRoll;

  useEffect(() => {
    if (rolledDice || (singleDie && availableDice.length > 0)) {
      const timer = setTimeout(() => setShowResult(true), 800);
      return () => clearTimeout(timer);
    } else {
      setShowResult(false);
    }
  }, [rolledDice, availableDice, singleDie]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => canRollRef.current,
      onPanResponderMove: (e, gestureState) => {
        if (gestureState.dy < 0) {
          pan.setValue({ x: gestureState.dx, y: gestureState.dy });
          setIsSwiping(true);
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dy < -40) {
          const velocity = Math.abs(gestureState.vy);
          onRollRef.current(Math.max(velocity, 0.8));
          RNAnimated.timing(pan, {
            toValue: { x: gestureState.dx * 2, y: -SCREEN_HEIGHT * 0.6 },
            duration: Math.max(150, 400 - velocity * 100),
            useNativeDriver: true,
          }).start(() => {
            pan.setValue({ x: 0, y: 0 });
            setIsSwiping(false);
          });
        } else {
          RNAnimated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start(() => setIsSwiping(false));
        }
      },
    })
  ).current;

  return (
    <View style={styles.panel}>
      {/* Swipe area wrapper */}
      <View 
        style={[styles.diceContainer, canRoll && styles.swipeActiveArea]}
        {...panResponder.panHandlers}
      >
        {rolledDice && showResult && !singleDie ? (
          <View style={styles.diceResultRow}>
            {(() => {
              const [d1, d2] = rolledDice;
              const isDouble = d1 === d2;
              if (isDouble) {
                return [0, 1, 2, 3].map(i => (
                  <DieFace key={i} value={d1} used={i >= availableDice.length} size={38} />
                ));
              }
              return (
                <>
                  <DieFace value={d1} used={!availableDice.includes(d1)} size={44} />
                  <DieFace value={d2} used={!availableDice.includes(d2)} size={44} />
                </>
              );
            })()}
          </View>
        ) : singleDie && availableDice.length > 0 && showResult ? (
          <View style={styles.diceResultRow}>
             <DieFace value={availableDice[0]} size={50} />
          </View>
        ) : canRoll ? (
          singleDie ? (
            <TouchableOpacity
              style={styles.singleDieTapArea}
              onPress={() => onRollRef.current(1.2)}
              activeOpacity={0.7}
            >
              <RNAnimated.View style={[
                styles.readyDice,
                { transform: [{ translateX: pan.x }, { translateY: pan.y }] }
              ]}>
                <DieFace value={6} size={46} />
                <Text style={styles.swipePromptText}>לחץ לזרוק</Text>
              </RNAnimated.View>
            </TouchableOpacity>
          ) : (
            <RNAnimated.View style={[
              styles.readyDice,
              { transform: [{ translateX: pan.x }, { translateY: pan.y }] }
            ]}>
              <View style={styles.dicePair}>
                <DieFace value={6} size={46} />
                <DieFace value={5} size={46} />
              </View>
              <Text style={styles.swipePromptText}>SWIPE UP TO THROW</Text>
            </RNAnimated.View>
          )
        ) : (
          <View style={styles.waitContainer}>
            <Text style={styles.waitText}>Waiting for Turn...</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
  },
  diceContainer: {
    width: '90%',
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  swipeActiveArea: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  diceResultRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  readyDice: {
    alignItems: 'center',
    gap: 10,
  },
  dicePair: {
    flexDirection: 'row',
    gap: 12,
  },
  swipePromptText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: 4,
  },
  waitContainer: {
    alignItems: 'center',
  },
  waitText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    fontStyle: 'italic',
  },
  singleDieTapArea: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dieFace: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
});
