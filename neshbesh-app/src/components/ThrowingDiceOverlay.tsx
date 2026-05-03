import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import { useGameStore } from '../store/useGameStore';

// ── Die Face for Overlay ──────────────────────────────────────────────────────
// Every internal measurement (pips, border radius, stroke) is a fraction of
// `size`, so the overlay face scales cleanly when `dieSize` changes across
// device sizes.
const DieFace: React.FC<{ value: number; size: number }> = ({ value, size }) => {
  const dotSize = size * 0.19;
  const radius = size * 0.22;
  const borderWidth = Math.max(1, size * 0.035);
  // Classic board: 1 & 4 red, 2/3/5/6 blue.
  const dotColor = value === 1 || value === 4 ? '#C21E1E' : '#0B3FA8';

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
    <View style={[styles.die, { width: size, height: size, borderRadius: radius, borderWidth }]}>
      {renderDots()}
    </View>
  );
};

// ── Throwing Dice Overlay ─────────────────────────────────────────────────────
// Dice fly from the active player's edge of the screen toward the board
// centre: White (top) throws downward, Black (bottom) throws upward. They
// shrink mid-flight, land on the board, and persist until the player completes
// the move (dice exhausted / turn ends).
export const ThrowingDiceOverlay: React.FC<{
  velocity?: number;
  /** Die pixel size while in flight/landed. Derived from the board's
   *  pieceSize at the App layer so it stays proportional across devices. */
  dieSize: number;
}> = ({ velocity = 1, dieSize }) => {
  const { dice, phase, availableDice, currentPlayer } = useGameStore();
  const [landedDice, setLandedDice] = useState<[number, number] | null>(null);
  const [animating, setAnimating] = useState(false);
  // Tumbling face values shown during the throw — cycled on interval.
  const [tumbleFaces, setTumbleFaces] = useState<[number, number]>([1, 1]);
  const tumbleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { width: SW, height: SH } = useWindowDimensions();

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

    // Kick off face tumble — change shown values every ~70ms until landing.
    if (tumbleTimerRef.current) clearInterval(tumbleTimerRef.current);
    const randFace = () => (1 + Math.floor(Math.random() * 6)) as number;
    setTumbleFaces([randFace(), randFace()]);
    tumbleTimerRef.current = setInterval(() => {
      setTumbleFaces([randFace(), randFace()]);
    }, 70);

    const intensity = Math.min(3, Math.max(0.8, velocity));
    // Directional throw: White (top) flies down from the top edge;
    // Black (bottom) flies up from the bottom edge.
    // Landing zone is centred vertically on the board so both throws cover a
    // symmetric distance — neither player's dice appear to fly off-screen.
    const fromTop = currentPlayer === 1;
    const startX = SW / 2;
    const startY = fromTop ? SH * 0.15 : SH * 0.85;

    diceAnims.forEach(a => a.setValue({ x: startX, y: startY }));
    diceRotations.forEach(r => r.setValue(0));
    diceScales.forEach(s => s.setValue(1.6)); // Start large
    diceOpacities.forEach(o => o.setValue(1));

    const animations = diceAnims.map((anim, i) => {
      const dur = ((420 + Math.random() * 160) / intensity);
      // Landing zone: centred around the board middle with a lateral spread
      // across the middle 50% of the screen. The vertical band is biased toward
      // the *opposite* edge so each throw visually "crosses" the board: White
      // (top) lands in the lower half of the centre band, Black (bottom) in the
      // upper half. Equal travel distance preserves physics parity.
      const landX = SW * 0.25 + Math.random() * SW * 0.5;
      const landY = fromTop
        ? SH * 0.45 + Math.random() * SH * 0.15
        : SH * 0.40 + Math.random() * SH * 0.15;

      return Animated.parallel([
        Animated.timing(anim, {
          toValue: { x: landX, y: landY },
          duration: dur,
          useNativeDriver: true,
          easing: Easing.bezier(0.1, 0.7, 0.2, 1),
        }),
        Animated.timing(diceRotations[i], {
          // Mirror tumble direction so White's dice spin counter-clockwise,
          // matching the reversed flight path.
          toValue: (6 + Math.random() * 10) * intensity * (fromTop ? -1 : 1),
          duration: dur,
          useNativeDriver: true,
        }),
        Animated.timing(diceScales[i], {
          toValue: 1,
          duration: dur,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]);
    });

    Animated.parallel(animations).start(() => {
      if (tumbleTimerRef.current) {
        clearInterval(tumbleTimerRef.current);
        tumbleTimerRef.current = null;
      }
      setTumbleFaces(values);
      setLandedDice(values);
      setAnimating(false);
    });
  };

  useEffect(() => () => {
    if (tumbleTimerRef.current) clearInterval(tumbleTimerRef.current);
  }, []);

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
          <DieFace value={tumbleFaces[i]} size={dieSize} />
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
                { scale: 0.95 },
              ],
            },
          ]}
        >
          <DieFace value={landedDice[i]} size={dieSize} />
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
    left: -15,
    top: -15,
    zIndex: 9999,
  },
  landedDie: {
    position: 'absolute',
    left: -15,
    top: -15,
    zIndex: 9998,
  },
});
