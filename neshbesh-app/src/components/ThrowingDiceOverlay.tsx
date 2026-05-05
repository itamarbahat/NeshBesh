import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { useGameStore } from '../store/useGameStore';
import { useMultiplayerStore } from '../store/useMultiplayerStore';
import { useAudioManager } from '../audio/useAudioManager';
import { BOARD_ASPECT, getOccupancyRects, type Rect } from './boardConstants';
import {
  BOARD_DIE_SCALE,
  LANDING_POP_MS,
  LANDING_POP_SCALE,
  getRollDurationMs,
  pickPairLandingPoints,
} from '../animations/diceConstants';

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
// centre and land on empty board surface (collision-aware via occupancy
// rejection sampling). Roll duration is randomized per throw on
// [ROLL_DURATION_MIN_MS, ROLL_DURATION_MAX_MS] so each roll feels different.
// On landing, dice pop up briefly (LANDING_POP_SCALE) before settling, and
// the shake/land SFX layers mirror the same timing.
export const ThrowingDiceOverlay: React.FC<{
  velocity?: number;
  /** Die pixel size while in flight/landed. Derived from the board's
   *  pieceSize at the App layer so it stays proportional across devices. */
  dieSize: number;
}> = ({ velocity = 1, dieSize }) => {
  // Narrowed selectors — this overlay is mounted full-time, so a full-state
  // subscription would re-render it on every store mutation (highlight changes,
  // message updates, etc.) and thrash the animation refs.
  const dice = useGameStore((s) => s.dice);
  const phase = useGameStore((s) => s.phase);
  const board = useGameStore((s) => s.board);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const gameMode = useMultiplayerStore((s) => s.gameMode);
  const mpRole = useMultiplayerStore((s) => s.role);
  const audio = useAudioManager();
  const [landedDice, setLandedDice] = useState<[number, number] | null>(null);
  const [animating, setAnimating] = useState(false);
  // Tumbling face values shown during the throw — cycled on interval.
  const [tumbleFaces, setTumbleFaces] = useState<[number, number]>([1, 1]);
  const tumbleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Overlay's own measured frame (board-local coord space). Captured via
  // onLayout so landing math stays accurate regardless of bear-off row,
  // safe-area insets, or orientation.
  const layoutRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

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
  // Stored so audio (shake) can read the same value the flight uses.
  const lastRollDurationRef = useRef<number>(0);

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

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    layoutRef.current = { width, height };
  };

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

    // Directional throw.
    //   Local hotseat: White (top) flies down, Black (bottom) flies up — the
    //     bar each player throws from is on their physical edge of the board.
    //   Remote two-device: every player views the screen the same way and
    //     their tray is at the bottom. Dice come from the bottom when *I*
    //     roll, from the top when the *opponent* rolls (where their chip is).
    let fromTop: boolean;
    if (gameMode === 'remote') {
      const mySign = mpRole === 'host' ? 1 : -1;
      fromTop = currentPlayer !== mySign;
    } else {
      fromTop = currentPlayer === 1;
    }

    // Resolve the overlay's measured frame. Fall back to a board-width
    // estimate when onLayout has not yet fired (first render after mount).
    const layoutW = layoutRef.current.width || SW;
    const layoutH = layoutRef.current.height || SH;
    const frameWidth = layoutW;
    const frameHeight = Math.min(layoutH, frameWidth / BOARD_ASPECT);
    const frameTopOffset = Math.max(0, layoutH - frameHeight);

    // Collision-aware landing: rejection-sample two non-overlapping points
    // that miss every occupied checker stack.
    const occupied: Rect[] = getOccupancyRects(board, frameWidth, frameHeight);
    const [pA, pB] = pickPairLandingPoints(frameWidth, frameHeight, dieSize, occupied);
    const landings = [pA, pB].map(p => ({
      x: p.x - dieSize / 2,
      y: p.y + frameTopOffset - dieSize / 2,
    }));

    // Start position: off-board, on the throwing player's edge of the
    // overlay. Equal travel distance preserves physics parity.
    const startX = layoutW / 2 - dieSize / 2;
    const startY = fromTop ? -dieSize * 2 : layoutH + dieSize;

    diceAnims.forEach(a => a.setValue({ x: startX, y: startY }));
    diceRotations.forEach(r => r.setValue(0));
    diceScales.forEach(s => s.setValue(1.6)); // Start large
    diceOpacities.forEach(o => o.setValue(1));

    // Randomized roll duration — shared with audio so the shake SFX runs
    // for exactly the flight window.
    const rollDurationMs = getRollDurationMs();
    lastRollDurationRef.current = rollDurationMs;
    audio.playShakeFor(rollDurationMs);

    const intensity = Math.min(3, Math.max(0.8, velocity));

    const animations = diceAnims.map((anim, i) => {
      return Animated.parallel([
        Animated.timing(anim, {
          toValue: { x: landings[i].x, y: landings[i].y },
          duration: rollDurationMs,
          useNativeDriver: true,
          easing: Easing.bezier(0.1, 0.7, 0.2, 1),
        }),
        Animated.timing(diceRotations[i], {
          // Mirror tumble direction so White's dice spin counter-clockwise,
          // matching the reversed flight path.
          toValue: (6 + Math.random() * 10) * intensity * (fromTop ? -1 : 1),
          duration: rollDurationMs,
          useNativeDriver: true,
        }),
        Animated.timing(diceScales[i], {
          toValue: BOARD_DIE_SCALE,
          duration: rollDurationMs,
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
      // Landing: one thud per roll, plus a brief scale pop on each die.
      audio.playDiceLand();
      const popUpMs = 80;
      const popDownMs = Math.max(40, LANDING_POP_MS - popUpMs);
      diceScales.forEach(s => {
        Animated.sequence([
          Animated.timing(s, {
            toValue: BOARD_DIE_SCALE * LANDING_POP_SCALE,
            duration: popUpMs,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
          Animated.timing(s, {
            toValue: BOARD_DIE_SCALE,
            duration: popDownMs,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
        ]).start();
      });
    });
  };

  useEffect(() => () => {
    if (tumbleTimerRef.current) clearInterval(tumbleTimerRef.current);
  }, []);

  // Nothing to show
  if (!animating && !landedDice) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
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
                { scale: diceScales[i] },
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
    left: 0,
    top: 0,
    zIndex: 9999,
  },
  landedDie: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 9998,
  },
});
