import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import {
  Dice1, Dice2, Dice3, Dice4, Dice5, Dice6,
} from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';

const DICE_ICONS: Record<number, React.FC<LucideProps>> = {
  1: Dice1, 2: Dice2, 3: Dice3, 4: Dice4, 5: Dice5, 6: Dice6,
};

interface DoubleChooserPanelProps {
  onChoose: (value: number) => void;
}

/**
 * Inline panel displayed BELOW the board when a 4:5 is rolled.
 * Shows 6 large dice side-by-side; the player taps one to choose that double.
 */
export const DoubleChooserPanel: React.FC<DoubleChooserPanelProps> = ({ onChoose }) => {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);

  return (
    <MotiView
      from={{ opacity: 0, translateY: 30 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 400 }}
      style={styles.container}
    >
      <View style={styles.headerRow}>
        <Text style={styles.emoji}>🎯</Text>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>איזה דאבל שבא לך</Text>
          <Text style={styles.subtitle}>לחץ על קוביה לבחירת הדאבל</Text>
        </View>
      </View>

      <View style={styles.diceRow}>
        {[1, 2, 3, 4, 5, 6].map((value) => {
          const Icon = DICE_ICONS[value];
          const isHovered = hoveredValue === value;

          return (
            <MotiView
              key={value}
              from={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 14, delay: value * 60 }}
            >
              <TouchableOpacity
                style={[styles.dieButton, isHovered && styles.dieButtonActive]}
                onPress={() => onChoose(value)}
                onPressIn={() => setHoveredValue(value)}
                onPressOut={() => setHoveredValue(null)}
                activeOpacity={0.7}
              >
                <Icon size={38} color={isHovered ? '#FFD700' : '#FFF'} />
                <Text style={[styles.dieLabel, isHovered && styles.dieLabelActive]}>
                  {value}:{value}
                </Text>
              </TouchableOpacity>
            </MotiView>
          );
        })}
      </View>
    </MotiView>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'rgba(26, 13, 5, 0.95)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 100, 0.25)',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  headerTextContainer: {
    flex: 1,
  },
  emoji: {
    fontSize: 28,
  },
  title: {
    color: '#FFD700',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  diceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  dieButton: {
    flex: 1,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(123, 63, 32, 0.6)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(160, 85, 42, 0.5)',
    gap: 6,
  },
  dieButtonActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderColor: '#FFD700',
  },
  dieLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '700',
  },
  dieLabelActive: {
    color: '#FFD700',
  },
});
