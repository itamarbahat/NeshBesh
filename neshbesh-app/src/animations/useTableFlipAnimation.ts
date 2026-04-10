/**
 * useTableFlipAnimation — Reanimated-based hook for the dramatic
 * "3 Consecutive Doubles = Flip the Table" animation.
 *
 * Sequence:
 *   1. Board shakes violently left-right with increasing intensity
 *   2. Board rotates and scales up dramatically
 *   3. Brief hold at peak
 *   4. Resets back to normal position
 *
 * Returns an animated style to apply to the board wrapper `<Animated.View>`.
 */
import { useEffect, useCallback } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

export interface TableFlipControls {
  /** Animated style to spread onto the board's wrapping Animated.View */
  boardAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  /** Trigger the full flip sequence */
  triggerFlip: (onComplete?: () => void) => void;
  /** Whether the animation is currently playing */
  isFlipping: boolean;
}

export function useTableFlipAnimation(): TableFlipControls {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const isFlipping = useSharedValue(false);

  const boardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
  }));

  const triggerFlip = useCallback((onComplete?: () => void) => {
    isFlipping.value = true;

    // ── Phase 1: Violent shaking (0–1200ms) ───────────────────────────────────
    const shakeDuration = 60;
    const shakeEasing = Easing.inOut(Easing.sin);

    translateX.value = withSequence(
      // Mild shake
      withTiming(4, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(-4, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(6, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(-6, { duration: shakeDuration, easing: shakeEasing }),
      // Building intensity
      withTiming(10, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(-10, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(14, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(-14, { duration: shakeDuration, easing: shakeEasing }),
      // Maximum violence
      withTiming(20, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(-20, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(24, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(-24, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(18, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(-18, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(12, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(-12, { duration: shakeDuration, easing: shakeEasing }),
      // Still shaking through the flip
      withTiming(8, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(-8, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(4, { duration: shakeDuration, easing: shakeEasing }),
      withTiming(-4, { duration: shakeDuration, easing: shakeEasing }),
      // Settle
      withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) }),
    );

    // ── Vertical bounce during shake ──────────────────────────────────────────
    translateY.value = withSequence(
      withDelay(300, withTiming(-6, { duration: 100 })),
      withTiming(0, { duration: 100 }),
      withDelay(200, withTiming(-10, { duration: 80 })),
      withTiming(4, { duration: 80 }),
      withTiming(-8, { duration: 80 }),
      withTiming(0, { duration: 300, easing: Easing.out(Easing.bounce) }),
    );

    // ── Phase 2: Rotation (starts mid-shake, ~600ms in) ───────────────────────
    rotation.value = withSequence(
      // Small rotational wobble during shaking
      withTiming(2, { duration: 200, easing: shakeEasing }),
      withTiming(-2, { duration: 200, easing: shakeEasing }),
      withTiming(3, { duration: 150, easing: shakeEasing }),
      withTiming(-3, { duration: 150, easing: shakeEasing }),
      // THE FLIP — dramatic rotation
      withTiming(12, { duration: 250, easing: Easing.in(Easing.quad) }),
      withTiming(-8, { duration: 200, easing: Easing.out(Easing.quad) }),
      withTiming(5, { duration: 150 }),
      // Settle back
      withSpring(0, { damping: 8, stiffness: 120 }),
    );

    // ── Phase 3: Scale punch ──────────────────────────────────────────────────
    scale.value = withSequence(
      // Squeeze during shake
      withTiming(0.97, { duration: 300 }),
      withTiming(1.02, { duration: 200 }),
      // Big punch at flip apex
      withTiming(1.08, { duration: 200, easing: Easing.out(Easing.quad) }),
      withTiming(0.95, { duration: 150 }),
      // Settle
      withSpring(1, { damping: 10, stiffness: 150 }),
    );

    // ── Completion callback ───────────────────────────────────────────────────
    // Total animation is approximately 1600ms. Fire callback after that.
    if (onComplete) {
      translateX.value = withSequence(
        ...Array(20).fill(null).map((_, i) => 
          withTiming(
            i % 2 === 0 ? (4 + i * 1.5) : -(4 + i * 1.5),
            { duration: shakeDuration, easing: shakeEasing },
          ),
        ),
        withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) }),
        withDelay(200, withTiming(0, { duration: 1 }, () => {
          isFlipping.value = false;
          runOnJS(onComplete)();
        })),
      );
    }
  }, []);

  return {
    boardAnimatedStyle,
    triggerFlip,
    isFlipping: false, // Expose as reactive in a real implementation
  };
}
