import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import {
  Dice1, Dice2, Dice3, Dice4, Dice5, Dice6,
} from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';

const DICE_ICONS: Record<number, React.FC<LucideProps>> = {
  1: Dice1, 2: Dice2, 3: Dice3, 4: Dice4, 5: Dice5, 6: Dice6,
};

type RollMode = 'SPECIAL_43_ROLL' | 'SPECIAL_51_ROLL';

interface SingleDieRollerProps {
  mode: RollMode;
  onRoll: () => void;
}

/**
 * Displays ONE solitary die centered on the board for 4:3 (backward) or 5:1 (double determination).
 * Shows a "Tap to Roll" pulsing animation until tapped. On tap, fires the store's rollSingleDie.
 */
export const SingleDieRoller: React.FC<SingleDieRollerProps> = ({ mode, onRoll }) => {
  const [rolling, setRolling] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const [displayFace, setDisplayFace] = useState(1);

  // Pulsing "breathe" animation
  useEffect(() => {
    if (rolling) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [rolling]);

  // Rapid face-cycling during roll animation
  useEffect(() => {
    if (!rolling) return;
    const interval = setInterval(() => {
      setDisplayFace(Math.floor(Math.random() * 6) + 1);
    }, 80);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      onRoll(); // Actually trigger the store's rollSingleDie
    }, 700);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [rolling]);

  const handleTap = () => {
    if (rolling) return;
    setRolling(true);

    // Shake/rotate animation
    Animated.parallel([
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 5, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -5, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]),
      Animated.timing(rotateAnim, {
        toValue: 2,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 2],
    outputRange: ['0deg', '720deg'],
  });

  const Icon = DICE_ICONS[displayFace] || Dice1;

  const isBackward = mode === 'SPECIAL_43_ROLL';
  const titleText = isBackward ? '4:3 — Backward Move' : '5:1 — Lucky Double';
  const descText = isBackward
    ? 'Tap the die — the result determines how many steps you move backwards'
    : 'Tap the die — the result determines which double you play';

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.content}>
        <View style={styles.labelChip}>
          <Text style={styles.labelEmoji}>{isBackward ? '🔄' : '✨'}</Text>
          <View>
            <Text style={styles.labelTitle}>{titleText}</Text>
            <Text style={styles.labelDesc}>{descText}</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleTap}
          activeOpacity={0.85}
          disabled={rolling}
          style={styles.dieTouchable}
        >
          <Animated.View
            style={[
              styles.dieContainer,
              {
                transform: [
                  { scale: rolling ? 1 : pulseAnim },
                  { translateX: shakeAnim },
                  { rotate: rolling ? rotateInterpolate : '0deg' },
                ],
              },
            ]}
          >
            <View style={[styles.dieInner, rolling && styles.dieRolling]}>
              <Icon size={56} color={rolling ? '#FFA040' : '#FFF'} />
            </View>
          </Animated.View>
        </TouchableOpacity>

        {!rolling && (
          <Animated.View style={[styles.tapHint, { opacity: pulseAnim.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 1] }) }]}>
            <Text style={styles.tapHintText}>TAP TO ROLL</Text>
          </Animated.View>
        )}

        {rolling && (
          <Text style={styles.rollingText}>Rolling...</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 20,
    borderRadius: 8,
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(26, 13, 5, 0.9)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 100, 0.3)',
  },
  labelEmoji: {
    fontSize: 24,
  },
  labelTitle: {
    color: '#FFD700',
    fontSize: 15,
    fontWeight: '800',
  },
  labelDesc: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    maxWidth: 220,
  },
  dieTouchable: {
    padding: 8,
  },
  dieContainer: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dieInner: {
    width: 88,
    height: 88,
    borderRadius: 16,
    backgroundColor: 'rgba(123, 63, 32, 0.85)',
    borderWidth: 2,
    borderColor: 'rgba(160, 85, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  dieRolling: {
    backgroundColor: 'rgba(255, 140, 0, 0.3)',
    borderColor: '#FFA040',
  },
  tapHint: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
  },
  tapHintText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  rollingText: {
    color: '#FFA040',
    fontSize: 14,
    fontWeight: '700',
    fontStyle: 'italic',
  },
});
