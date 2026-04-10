/**
 * SpecialDiceGlow — A pulsing, glowing overlay on the dice area
 * that indicates a special roll state (6:5, 4:5, 5:1).
 *
 * Renders as a semi-transparent radial glow behind the dice with
 * a looping scale + opacity pulse animation via Reanimated.
 * Dismissible on tap.
 */
import React, { useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

interface SpecialDiceGlowProps {
  /** Whether the glow overlay is visible */
  visible: boolean;
  /** Label of the special roll, e.g. "6:5 NESH STRIKE" */
  label: string;
  /** The colour accent for the glow ring */
  color?: string;
  /** Called when the user taps to dismiss */
  onDismiss: () => void;
}

export const SpecialDiceGlow: React.FC<SpecialDiceGlowProps> = ({
  visible,
  label,
  color = '#FFD700',
  onDismiss,
}) => {
  // ── Reanimated shared values ────────────────────────────────────────────────
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.35);
  const ringScale = useSharedValue(0.85);
  const ringOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (visible) {
      // Core glow pulse: scale 1 → 1.25 → 1, opacity 0.35 → 0.7 → 0.35
      glowScale.value = withRepeat(
        withSequence(
          withTiming(1.25, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.72, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );

      // Outer expanding ring
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 1400, easing: Easing.out(Easing.quad) }),
          withTiming(0.85, { duration: 0 }),
        ),
        -1,
        false,
      );
      ringOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 1400, easing: Easing.out(Easing.quad) }),
          withTiming(0.6, { duration: 0 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(glowScale);
      cancelAnimation(glowOpacity);
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
      glowScale.value = 1;
      glowOpacity.value = 0.35;
      ringScale.value = 0.85;
      ringOpacity.value = 0.6;
    }
  }, [visible]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  if (!visible) return null;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onDismiss}
      activeOpacity={0.9}
    >
      {/* Expanding ring */}
      <Animated.View
        style={[
          styles.ring,
          ringStyle,
          { borderColor: color },
        ]}
      />

      {/* Central glow blob */}
      <Animated.View
        style={[
          styles.glow,
          glowStyle,
          { backgroundColor: color },
        ]}
      />

      {/* Label */}
      <View style={styles.labelContainer}>
        <Text style={[styles.label, { color }]}>{label}</Text>
        <Text style={styles.sublabel}>Tap to dismiss</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  glow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    // The glow is soft via the opacity animation
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
  ring: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  labelContainer: {
    position: 'absolute',
    bottom: '20%',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  sublabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
  },
});
