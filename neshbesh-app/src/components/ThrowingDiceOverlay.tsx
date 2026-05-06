import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { useGameStore } from '../store/useGameStore';
import { useMultiplayerStore } from '../store/useMultiplayerStore';
import { BOARD_ASPECT, BOARD_FROZEN, getOccupancyRects, type Rect } from './boardConstants';
import {
  BOARD_DIE_SCALE,
  LANDING_POP_MS,
  LANDING_POP_SCALE,
  PHYSICS_FRAME_DT_MS,
  ROLL_HARD_CAP_MS,
  getRollDurationMs,
  simulateDiceFlight,
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
// On landing, dice pop up briefly (LANDING_POP_SCALE) before settling.
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

  // Track the rAF tick driving the physics playback so a fresh roll can
  // cancel the previous simulation cleanly.
  const tickHandleRef = useRef<number | null>(null);

  const cancelTick = () => {
    if (tickHandleRef.current !== null) {
      cancelAnimationFrame(tickHandleRef.current);
      tickHandleRef.current = null;
    }
  };

  const animateThrow = (values: [number, number]) => {
    setAnimating(true);
    setLandedDice(null);
    cancelTick();

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

    // Forbidden rects fed to the simulator (US-007 elastic walls already
    // covered by `walls`; US-010 occlusion guard uses `forbiddenRects`):
    //   • Every occupied checker stack — preserves the existing avoidance.
    //   • The center bar strip — the Move-Dice / pip-indicator zone the
    //     player must always be able to see at a glance.
    const checkerRects: Rect[] = getOccupancyRects(board, frameWidth, frameHeight);
    const FRAME_BORDER = 8;
    const innerW = frameWidth - FRAME_BORDER * 2;
    const barW = innerW * BOARD_FROZEN.BAR_WIDTH_RATIO;
    const barCenterX = FRAME_BORDER + (innerW - barW) / 2 + barW / 2;
    const barRect: Rect = {
      x: barCenterX - barW / 2,
      y: FRAME_BORDER,
      w: barW,
      h: frameHeight - FRAME_BORDER * 2,
    };
    const forbiddenRects: Rect[] = [...checkerRects, barRect];

    // Initial pose: off-board on the throwing player's edge, launched
    // toward the play area at high velocity. The simulator handles wall
    // reflections, dice-on-dice collisions, and the rest pose.
    const half = dieSize / 2;
    const startCenterX = frameWidth / 2;
    const startCenterY = fromTop ? FRAME_BORDER + half : frameHeight - FRAME_BORDER - half;
    const launchSign = fromTop ? 1 : -1;
    // Px/ms — chosen so a typical throw covers the board diagonal in <1.5s
    // before friction takes over.
    const baseSpeed = 0.85 * Math.min(2.5, Math.max(0.7, velocity));
    const startA = {
      x: startCenterX - dieSize * 0.6,
      y: startCenterY,
      vx: (Math.random() - 0.5) * baseSpeed * 0.6,
      vy: launchSign * baseSpeed,
      theta: 0,
      omega: (Math.random() * 0.025 + 0.015) * (fromTop ? 1 : -1),
    };
    const startB = {
      x: startCenterX + dieSize * 0.6,
      y: startCenterY,
      vx: (Math.random() - 0.5) * baseSpeed * 0.6,
      vy: launchSign * baseSpeed * (0.85 + Math.random() * 0.3),
      theta: 0,
      omega: (Math.random() * 0.025 + 0.015) * (fromTop ? -1 : 1),
    };

    const sim = simulateDiceFlight({
      walls: {
        left: FRAME_BORDER,
        right: frameWidth - FRAME_BORDER,
        top: FRAME_BORDER,
        bottom: frameHeight - FRAME_BORDER,
      },
      forbiddenRects,
      dieSize,
      startA,
      startB,
      hardCapMs: ROLL_HARD_CAP_MS,
    });

    // Visual playback duration: bounded by ROLL_HARD_CAP_MS but randomized
    // within [ROLL_DURATION_MIN_MS, ROLL_HARD_CAP_MS] so each roll feels a
    // little different. The simulation runs to sim.simDurationMs and freezes;
    // we play that real duration so motion matches the tumble loop.
    const flightMs = Math.min(sim.simDurationMs || getRollDurationMs(), ROLL_HARD_CAP_MS);
    lastRollDurationRef.current = flightMs;

    // Initial transform values (top-left corner coords for the View).
    const initialA = sim.framesA[0];
    const initialB = sim.framesB[0];
    diceAnims[0].setValue({ x: initialA.x - half, y: initialA.y + frameTopOffset - half });
    diceAnims[1].setValue({ x: initialB.x - half, y: initialB.y + frameTopOffset - half });
    diceRotations[0].setValue(initialA.theta);
    diceRotations[1].setValue(initialB.theta);
    diceScales.forEach(s => s.setValue(1.6));
    diceOpacities.forEach(o => o.setValue(1));

    // Drive the per-frame poses with rAF — JS-thread updates to
    // Animated.Value with useNativeDriver:false. Total frames ≤ 188
    // (3000ms / 16ms + 1) so this is well under React Native's bridge
    // budget for the flight window.
    const t0 = Date.now();
    const totalFrames = sim.framesA.length;
    const frameDt = PHYSICS_FRAME_DT_MS;

    const tick = () => {
      const elapsed = Date.now() - t0;
      const frameIdx = Math.min(totalFrames - 1, Math.floor(elapsed / frameDt));
      const fA = sim.framesA[frameIdx];
      const fB = sim.framesB[frameIdx];
      diceAnims[0].setValue({ x: fA.x - half, y: fA.y + frameTopOffset - half });
      diceAnims[1].setValue({ x: fB.x - half, y: fB.y + frameTopOffset - half });
      diceRotations[0].setValue(fA.theta);
      diceRotations[1].setValue(fB.theta);

      if (elapsed >= flightMs) {
        // Hard-snap to final pose (US-009): the simulation may have
        // settled before flightMs but never after — clamp to the
        // deterministic last frame either way.
        const finalA = sim.finalA;
        const finalB = sim.finalB;
        diceAnims[0].setValue({ x: finalA.x - half, y: finalA.y + frameTopOffset - half });
        diceAnims[1].setValue({ x: finalB.x - half, y: finalB.y + frameTopOffset - half });
        diceRotations[0].setValue(finalA.theta);
        diceRotations[1].setValue(finalB.theta);
        onFlightComplete(values);
        return;
      }
      tickHandleRef.current = requestAnimationFrame(tick);
    };
    tickHandleRef.current = requestAnimationFrame(tick);

    // In-flight scale: shrink from tray scale to board scale over the
    // flight. This stays on the native driver since it doesn't depend on
    // simulation output.
    diceScales.forEach(s => {
      Animated.timing(s, {
        toValue: BOARD_DIE_SCALE,
        duration: flightMs,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start();
    });
  };

  const onFlightComplete = (values: [number, number]) => {
    cancelTick();
    if (tumbleTimerRef.current) {
      clearInterval(tumbleTimerRef.current);
      tumbleTimerRef.current = null;
    }
    setTumbleFaces(values);
    setLandedDice(values);
    setAnimating(false);
    // Brief scale pop on each die at landing.
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
  };

  useEffect(() => () => {
    if (tumbleTimerRef.current) clearInterval(tumbleTimerRef.current);
    cancelTick();
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
                    // Physics theta is in radians; map π rad → 180°.
                    // `extrapolate: 'extend'` handles accumulated rotations
                    // outside [-π, π] without clamping.
                    inputRange: [-Math.PI, Math.PI],
                    outputRange: ['-180deg', '180deg'],
                    extrapolate: 'extend',
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
                    // Physics theta is in radians; map π rad → 180°.
                    // `extrapolate: 'extend'` handles accumulated rotations
                    // outside [-π, π] without clamping.
                    inputRange: [-Math.PI, Math.PI],
                    outputRange: ['-180deg', '180deg'],
                    extrapolate: 'extend',
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
