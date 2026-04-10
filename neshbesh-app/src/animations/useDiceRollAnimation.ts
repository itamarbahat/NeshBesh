/**
 * useDiceRollAnimation — Reanimated dice tumble animation.
 *
 * Applies a brief spin + bounce to dice faces after rolling,
 * making the dice feel physical and weighty.
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

export function useDiceRollAnimation() {
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const diceAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
  }));

  const triggerRoll = useCallback(() => {
    // Tumble rotation: 0 → 360 → 720 → settle
    rotation.value = withSequence(
      withTiming(360, { duration: 200, easing: Easing.in(Easing.quad) }),
      withTiming(540, { duration: 150, easing: Easing.inOut(Easing.sin) }),
      withSpring(720, { damping: 10, stiffness: 100 }),
      // Reset to 0 (visually same)
      withTiming(0, { duration: 0 }),
    );

    // Bounce: up → down → settle
    translateY.value = withSequence(
      withTiming(-18, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(6, { duration: 100, easing: Easing.in(Easing.quad) }),
      withTiming(-4, { duration: 80 }),
      withSpring(0, { damping: 8, stiffness: 150 }),
    );

    // Scale punch on land
    scale.value = withSequence(
      withTiming(0.8, { duration: 80 }),
      withTiming(1.15, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 8, stiffness: 180 }),
    );
  }, []);

  return { diceAnimatedStyle, triggerRoll };
}
