import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import { useGameStore } from '../store/useGameStore';

// ── Die Face for Overlay ──────────────────────────────────────────────────────
const DieFace: React.FC<{ value: number; size?: number }> = ({ value, size = 48 }) => {
  const dotSize = size * 0.18;
  const dotColor = '#0047AB';
  
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
      <View key={i} style={{
        position: 'absolute', left: `${x}%`, top: `${y}%`,
        width: dotSize, height: dotSize, borderRadius: dotSize / 2,
        backgroundColor: dotColor, marginLeft: -dotSize / 2, marginTop: -dotSize / 2,
      }} />
    ));
  };

  return (
    <View style={[styles.die, { width: size, height: size, borderRadius: size * 0.18 }]}>
      {renderDots()}
    </View>
  );
};

// ── Throwing Dice Overlay ─────────────────────────────────────────────────────
// Dice fly from bottom, shrink as they travel, land small on the board, persist
// until the player completes the move (dice exhausted / turn ends).
export const ThrowingDiceOverlay: React.FC<{ velocity?: number }> = ({ velocity = 1 }) => {
  const { dice, phase, availableDice } = useGameStore();
  const [landedDice, setLandedDice] = useState<[number, number] | null>(null);
  const [animating, setAnimating] = useState(false);
  
  const { width: SW, height: SH } = useWindowDimensions();

  // Landing die size — small, resting on the board
  const LANDED_SIZE = 22;

  const diceAnims = [
    useRef(new Animated.ValueXY({ x: SW / 2, y: SH })).current,
    useRef(new Animated.ValueXY({ x: SW / 2, y: SH })).current,
  ];
  const diceRotations = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
  const diceScales = [
    useRef(new Animated.Value(1.5)).current,
    useRef(new Animated.Value(1.5)).current,
  ];
  const diceOpacities = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  const prevDiceRef = useRef(dice);

  // When dice change → new throw animation
  useEffect(() => {
    if (!dice) { setLandedDice(null); return; }
    if (dice === prevDiceRef.current) return;
    // Only animate on actual new roll (not re-renders)
    if (prevDiceRef.current && dice[0] === prevDiceRef.current[0] && dice[1] === prevDiceRef.current[1]) return;
    prevDiceRef.current = dice;
    animateThrow(dice);
  }, [dice]);

  // Clear landed dice when turn resets (phase back to WAITING_ROLL or new player)
  useEffect(() => {
    if (phase === 'WAITING_ROLL' || phase === 'GAME_OVER') {
      setLandedDice(null);
    }
  }, [phase]);

  const animateThrow = (values: [number, number]) => {
    setAnimating(true);
    setLandedDice(null);

    const intensity = Math.min(3, Math.max(0.8, velocity));
    const startX = SW / 2;
    const startY = SH * 0.85;

    diceAnims.forEach(a => a.setValue({ x: startX, y: startY }));
    diceRotations.forEach(r => r.setValue(0));
    diceScales.forEach(s => s.setValue(1.5)); // Start large
    diceOpacities.forEach(o => o.setValue(1));

    const animations = diceAnims.map((anim, i) => {
      const dur = ((800 + Math.random() * 400) / intensity);
      // Land roughly in the center of the board area
      const landX = SW * 0.25 + Math.random() * SW * 0.5;
      const landY = SH * 0.25 + Math.random() * SH * 0.25;

      return Animated.sequence([
        Animated.delay(i * 100),
        Animated.parallel([
          Animated.timing(anim, {
            toValue: { x: landX, y: landY },
            duration: dur,
            useNativeDriver: true,
            easing: Easing.bezier(0.1, 0.7, 0.2, 1),
          }),
          Animated.timing(diceRotations[i], {
            toValue: (6 + Math.random() * 10) * intensity,
            duration: dur,
            useNativeDriver: true,
          }),
          // Scale: start large (1.5), ends small (0.55)
          Animated.timing(diceScales[i], {
            toValue: 0.55,
            duration: dur,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }),
        ]),
      ]);
    });

    Animated.parallel(animations).start(() => {
      setLandedDice(values);
      setAnimating(false);
    });
  };

  // Nothing to show
  if (!animating && !landedDice) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {animating && diceAnims.map((anim, i) => (
        <Animated.View
          key={`throw-${i}`}
          style={[
            styles.animatedDie,
            {
              transform: [
                { translateX: anim.x },
                { translateY: anim.y },
                { rotate: diceRotations[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  })
                },
                { scale: diceScales[i] },
              ],
              opacity: diceOpacities[i],
            },
          ]}
        >
          <DieFace value={landedDice ? landedDice[i] : (dice ? dice[i] : 1)} size={LANDED_SIZE} />
        </Animated.View>
      ))}

      {/* Landed dice — persist on board until move completes */}
      {landedDice && !animating && diceAnims.map((anim, i) => (
        <Animated.View
          key={`landed-${i}`}
          style={[
            styles.landedDie,
            {
              transform: [
                { translateX: anim.x },
                { translateY: anim.y },
                { rotate: diceRotations[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  })
                },
                { scale: 0.55 },
              ],
            },
          ]}
        >
          <DieFace value={landedDice[i]} size={LANDED_SIZE} />
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  die: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CCC',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animatedDie: {
    position: 'absolute',
    left: -11,
    top: -11,
    zIndex: 9999,
  },
  landedDie: {
    position: 'absolute',
    left: -11,
    top: -11,
    zIndex: 9998,
  },
});
