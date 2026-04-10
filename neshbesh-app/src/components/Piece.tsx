import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { MotiView } from 'moti';

interface PieceProps {
  sign: 1 | -1;
  size?: number;
  animated?: boolean;
  /** Optional count label for stacked display (e.g. "x8") */
  stackLabel?: string;
}

/**
 * Luxury backgammon stone / checker piece.
 *
 * Uses layered Views to simulate a radial-gradient effect that looks
 * like a real polished stone — no SVG dependency needed.
 *
 * White stones:  Ivory → warm cream center → subtle highlight ring
 * Black stones:  Deep charcoal → lighter graphite center → inner shine
 */
export const Piece: React.FC<PieceProps> = ({
  sign,
  size = 30,
  animated = false,
  stackLabel,
}) => {
  const isWhite = sign === 1;

  // ── Colour palette ──────────────────────────────────────────────────────────
  const outerBg    = isWhite ? '#E8DCC8' : '#1C1C1C';
  const middleBg   = isWhite ? '#F5EDD8' : '#2A2A2A';
  const innerBg    = isWhite ? '#FFF8EA' : '#383838';
  const highlightBg = isWhite ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.12)';
  const borderCol  = isWhite ? '#B8A88A' : '#555';
  const shadowBg   = isWhite ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.35)';
  const ringBorder = isWhite ? 'rgba(180,160,120,0.4)' : 'rgba(255,215,0,0.15)';

  const piece = (
    <View style={[styles.outerShadow, { width: size + 2, height: size + 2, borderRadius: (size + 2) / 2 }]}>
      {/* Bottom shadow ring */}
      <View
        style={[
          styles.shadowRing,
          {
            width: size + 2,
            height: size + 2,
            borderRadius: (size + 2) / 2,
            backgroundColor: shadowBg,
          },
        ]}
      />

      {/* Main body — outermost stone ring */}
      <View
        style={[
          styles.stoneBody,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: outerBg,
            borderColor: borderCol,
          },
        ]}
      >
        {/* Second ring — mid gradient */}
        <View
          style={{
            width: size * 0.78,
            height: size * 0.78,
            borderRadius: (size * 0.78) / 2,
            backgroundColor: middleBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Third ring — inner core */}
          <View
            style={{
              width: size * 0.55,
              height: size * 0.55,
              borderRadius: (size * 0.55) / 2,
              backgroundColor: innerBg,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 0.5,
              borderColor: ringBorder,
            }}
          >
            {/* Top-left specular highlight */}
            <View
              style={{
                position: 'absolute',
                top: size * 0.04,
                left: size * 0.06,
                width: size * 0.22,
                height: size * 0.16,
                borderRadius: size * 0.1,
                backgroundColor: highlightBg,
                transform: [{ rotate: '-25deg' }],
              }}
            />
          </View>
        </View>
      </View>

      {/* Stack count label overlay */}
      {stackLabel && (
        <View style={[styles.labelContainer, { width: size, height: size }]}>
          <Text
            style={[
              styles.stackLabelText,
              {
                fontSize: size * 0.36,
                color: isWhite ? '#5C3D1A' : '#FFD700',
                textShadowColor: isWhite ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.6)',
              },
            ]}
          >
            {stackLabel}
          </Text>
        </View>
      )}
    </View>
  );

  if (animated) {
    return (
      <MotiView
        from={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 14, stiffness: 180 }}
      >
        {piece}
      </MotiView>
    );
  }

  return piece;
};

const styles = StyleSheet.create({
  outerShadow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadowRing: {
    position: 'absolute',
    bottom: -1,
    alignSelf: 'center',
  },
  stoneBody: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    // Platform shadow (iOS)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    // Android elevation
    elevation: 5,
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackLabelText: {
    fontWeight: '900',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
