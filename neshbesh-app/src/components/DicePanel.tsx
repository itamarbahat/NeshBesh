import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, PanResponder, Dimensions, Animated as RNAnimated, TouchableOpacity } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Die Face Component ────────────────────────────────────────────────────────
// All internal styling (pips, border radius, bevels, outer border) is
// expressed as fractions of `size`, so the face scales cleanly from a tiny
// landed die on the board to the larger ready-to-throw dice in the tray.
interface DieFaceProps {
  value: number;
  used?: boolean;
  size: number;
}

export const DieFace: React.FC<DieFaceProps> = ({ value, used = false, size }) => {
  const dotSize = size * 0.19;
  const radius = size * 0.22;
  const innerRadius = size * 0.2;
  const bevelInset = Math.max(1, size * 0.04);
  const outerBorderWidth = Math.max(1, size * 0.03);
  const bevelStrokeWidth = Math.max(0.5, size * 0.025);

  // Classic reference-board palette: 1 & 4 red, 2/3/5/6 blue.
  const isRedValue = value === 1 || value === 4;
  const activeColor = isRedValue ? '#C21E1E' : '#0B3FA8';
  const dotColor = used ? '#9A9A9A' : activeColor;

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
          borderColor: '#BDBDBD',
          borderWidth: outerBorderWidth,
          borderRadius: radius,
          opacity: used ? 0.45 : 1,
        },
      ]}
    >
      {/* Subtle inner bevel for depth */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: bevelInset,
          left: bevelInset,
          right: bevelInset,
          bottom: bevelInset,
          borderRadius: innerRadius,
          borderTopWidth: bevelStrokeWidth,
          borderLeftWidth: bevelStrokeWidth,
          borderTopColor: 'rgba(255,255,255,0.9)',
          borderLeftColor: 'rgba(255,255,255,0.6)',
          borderBottomWidth: bevelStrokeWidth,
          borderRightWidth: bevelStrokeWidth,
          borderBottomColor: 'rgba(0,0,0,0.08)',
          borderRightColor: 'rgba(0,0,0,0.06)',
        }}
      />
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
  /** Base die pixel size. Derived from the board's pieceSize (~0.6x). */
  dieSize: number;
}

export const DicePanel: React.FC<DicePanelProps> = ({
  rolledDice,
  availableDice,
  canRoll,
  onRoll,
  singleDie = false,
  dieSize,
}) => {
  // Derived sizes — tightened so every variant stays within
  // [0.5, 0.66] × pieceSize given dieSize ≈ 0.6 × pieceSize.
  //   result (1.00) → 0.60×piece     doubles row (0.87) → 0.52×piece
  //   single result (1.10) → 0.66×piece
  const resultSize = dieSize;
  const doubleSize = Math.round(dieSize * 0.87);
  const singleResultSize = Math.round(dieSize * 1.10);
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
      const timer = setTimeout(() => setShowResult(true), 450);
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
              // Special double (e.g. 5:1 result): availableDice has 4 identical values
              const isSpecialDouble = !isDouble && availableDice.length === 4
                && availableDice.every(d => d === availableDice[0]);
              if (isDouble || isSpecialDouble) {
                const dv = isDouble ? d1 : availableDice[0];
                return [0, 1, 2, 3].map(i => (
                  <DieFace key={i} value={dv} used={i >= availableDice.length} size={doubleSize} />
                ));
              }
              return (
                <>
                  <DieFace value={d1} used={!availableDice.includes(d1)} size={resultSize} />
                  <DieFace value={d2} used={!availableDice.includes(d2)} size={resultSize} />
                </>
              );
            })()}
          </View>
        ) : singleDie && availableDice.length > 0 && showResult ? (
          <View style={styles.diceResultRow}>
             <DieFace value={availableDice[0]} size={singleResultSize} />
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
                <DieFace value={6} size={dieSize} />
                <Text style={styles.swipePromptText}>לחץ לזרוק</Text>
              </RNAnimated.View>
            </TouchableOpacity>
          ) : (
            <RNAnimated.View style={[
              styles.readyDice,
              { transform: [{ translateX: pan.x }, { translateY: pan.y }] }
            ]}>
              <View style={styles.dicePair}>
                <DieFace value={6} size={dieSize} />
                <DieFace value={5} size={dieSize} />
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
    paddingVertical: 4,
    alignItems: 'center',
  },
  diceContainer: {
    width: '94%',
    minHeight: 56,
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
