import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { useGameStore } from '../store/useGameStore';

/**
 * Phase-agnostic floating caption that surfaces `state.message` (PRD §3.4, §4.6).
 *
 * The store sets `message` for 5:2 ("לך 5:2 אחורה!"), 4:3 phases
 * ("הטל קוביה" / "לך אחורה X צעדים!"), and other transient prompts. Some of
 * those messages are ALSO rendered inside their phase-specific cards
 * (SpecialRollCard for SKIP / 4:3 RESULT / 5:2 acknowledgement) — that
 * duplication is intentional: the inline card is the actionable surface, this
 * banner is the larger ambient caption that floats above the board.
 *
 * Position: top-center, anchored above the dice area, pointer-events disabled
 * so it never blocks taps. The store nulls `message` after ~3s, so this
 * component just renders whatever's currently in the store.
 */
export const MessageBanner: React.FC = () => {
  const message = useGameStore((s) => s.message);

  if (!message) return null;

  return (
    <View pointerEvents="none" style={styles.wrapper}>
      <MotiView
        key={message}
        from={{ opacity: 0, translateY: -8, scale: 0.96 }}
        animate={{ opacity: 1, translateY: 0, scale: 1 }}
        transition={{ type: 'timing', duration: 220 }}
        style={styles.chip}
      >
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </MotiView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 12,
    zIndex: 200,
    elevation: 30,
  },
  chip: {
    maxWidth: '80%',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(26, 13, 5, 0.94)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 215, 0, 0.55)',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 14,
  },
  text: {
    color: '#FFD700',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
    writingDirection: 'rtl',
  },
});
