/**
 * useEatAnimation — Reanimated hook for the "piece captured" impact VFX.
 *
 * When triggered, applies a ripple-like scale bump + flash to a target View,
 * simulating the satisfying "clack" of a stone hitting another stone.
 */
import { useCallback } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';

export function useEatAnimation() {
  const impactScale = useSharedValue(1);
  const impactOpacity = useSharedValue(0);

  const impactStyle = useAnimatedStyle(() => ({
    transform: [{ scale: impactScale.value }],
    opacity: impactOpacity.value,
  }));

  const triggerEat = useCallback(() => {
    // Sharp scale punch: 1 → 1.35 → 0.9 → spring to 1
    impactScale.value = withSequence(
      withTiming(1.35, { duration: 80, easing: Easing.out(Easing.quad) }),
      withTiming(0.88, { duration: 100, easing: Easing.in(Easing.quad) }),
      withSpring(1, { damping: 6, stiffness: 200 }),
    );

    // Flash: 0 → 1 → 0
    impactOpacity.value = withSequence(
      withTiming(1, { duration: 60 }),
      withTiming(0.6, { duration: 120 }),
      withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) }),
    );
  }, []);

  return { impactStyle, triggerEat };
}
